import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { keccak256 } from 'viem';

const wallet = '0xB4C01A6bE9278Db57803BFb57C7a9a70117AfBFF';
const rpc = 'https://rpc.testnet.arc.io';
const artifact = JSON.parse(await readFile('contracts/out/CampaignFactory.sol/CampaignFactory.json', 'utf8'));
const bytecode = artifact.bytecode.object;
const creationBytecodeHash = keccak256(bytecode);

/** Read public chain state; the browser wallet alone authorizes and submits deployment. */
async function request(method, params = []) {
  const response = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  return result.result;
}

if (await request('eth_chainId') !== '0x4cef52') throw new Error('RPC is not Arc Testnet');
console.log('Wallet balance (native USDC base units):', BigInt(await request('eth_getBalance', [wallet, 'latest'])).toString());
console.log('Open http://localhost:8547 in the browser that has your wallet extension.');

/** Serve a local signing UI and persist only deployments verified against public RPC state. */
createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8547');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST' && req.url === '/receipt') {
      if (req.headers.origin !== 'http://localhost:8547') throw new Error('Untrusted origin');
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 256) throw new Error('Request too large'); }
      const { hash } = JSON.parse(body);
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Invalid transaction hash');
      const tx = await request('eth_getTransactionByHash', [hash]);
      const receipt = await request('eth_getTransactionReceipt', [hash]);
      if (!tx || tx.from.toLowerCase() !== wallet.toLowerCase() || tx.to !== null || tx.input.toLowerCase() !== bytecode.toLowerCase() || !receipt || receipt.status !== '0x1' || !receipt.contractAddress) throw new Error('Deployment has not been verified');
      const code = await request('eth_getCode', [receipt.contractAddress, 'latest']);
      let normalized = code.slice(2);
      let expected = artifact.deployedBytecode.object.slice(2);
      for (const refs of Object.values(artifact.deployedBytecode.immutableReferences)) for (const { start, length } of refs) {
        normalized = normalized.slice(0, start * 2) + '0'.repeat(length * 2) + normalized.slice((start + length) * 2);
        expected = expected.slice(0, start * 2) + '0'.repeat(length * 2) + expected.slice((start + length) * 2);
      }
      if (normalized !== expected) throw new Error('Deployed runtime does not match the compiler artifact');
      const usdc = await request('eth_call', [{ to: receipt.contractAddress, data: '0x' + artifact.methodIdentifiers['USDC()'] }, 'latest']);
      if (usdc.slice(-40).toLowerCase() !== '3600000000000000000000000000000000000000') throw new Error('Incorrect USDC configuration');
      const deployment = { chainId: 5042002, contract: 'CampaignFactory', address: receipt.contractAddress, deployer: tx.from, transactionHash: hash, blockNumber: Number(BigInt(receipt.blockNumber)), creationBytecodeHash, runtimeCodeHash: keccak256(code) };
      await mkdir('contracts/deployments', { recursive: true });
      try {
        const previous = JSON.parse(await readFile('contracts/deployments/arc-testnet.json', 'utf8'));
        if (previous.transactionHash !== hash) {
          await mkdir('contracts/deployments/history', { recursive: true });
          await writeFile(`contracts/deployments/history/${previous.transactionHash}.json`, JSON.stringify(previous, null, 2) + '\n');
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await writeFile('contracts/deployments/arc-testnet.json', JSON.stringify(deployment, null, 2) + '\n');
      // Publish the verified address alongside the ABIs consumed by both application workspaces.
      await import(`./generate-abi.mjs?deployment=${hash}`);
      console.log('Verified deployment:', deployment);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(deployment));
      return;
    }
    if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><meta charset="utf-8"><title>Cinevest Arc deployment</title>
<h1>Deploy CampaignFactory on Arc Testnet</h1><p>Required wallet: ${wallet}</p>
<p>Deploys your compiled factory. Individual campaigns are subsequently created through this factory.</p>
<button id="deploy">Connect wallet and deploy</button><pre id="status"></pre>
<script>
const status = document.getElementById('status');
document.getElementById('deploy').onclick = async function () {
 this.disabled = true;
 try {
  const provider = window.ethereum;
  if (!provider) throw Error('Open this page in a browser with MetaMask or Rabby installed.');
  const accounts = await provider.request({method:'eth_requestAccounts'});
  if (accounts[0]?.toLowerCase() !== '${wallet.toLowerCase()}') throw Error('Select the required wallet address and retry.');
  try { await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x4cef52'}]}); }
  catch (error) {
   if (error.code !== 4902) throw error;
   await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0x4cef52',chainName:'Arc Testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:['${rpc}'],blockExplorerUrls:['https://explorer.testnet.arc.io']}]});
   await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x4cef52'}]});
  }
  if (await provider.request({method:'eth_chainId'}) !== '0x4cef52') throw Error('Wrong network');
  const current = await provider.request({method:'eth_accounts'});
  if (current[0]?.toLowerCase() !== '${wallet.toLowerCase()}') throw Error('Wallet account changed');
  status.textContent = 'Review the contract deployment and gas fee in your wallet.';
  const hash = await provider.request({method:'eth_sendTransaction',params:[{from:current[0],data:'${bytecode}',value:'0x0'}]});
  localStorage.setItem('cinevestFactoryDeployment:${creationBytecodeHash}', hash);
  await verify(hash);
 } catch(error) { status.textContent = error.message; this.disabled = false; }
};
// Retain the transaction hash so refreshing cannot accidentally lose a pending deployment.
async function verify(hash) {
 status.textContent = 'Waiting for confirmation: ' + hash;
 for (let attempt = 0; attempt < 120; attempt++) {
  const response = await fetch('/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash})});
  if (response.ok) { status.textContent = JSON.stringify(await response.json(),null,2); return; }
  await new Promise(resolve => setTimeout(resolve, 2000));
 }
 throw Error('Confirmation not available yet. Refresh to check the saved transaction.');
}
const saved = localStorage.getItem('cinevestFactoryDeployment:${creationBytecodeHash}');
if (saved) { document.getElementById('deploy').disabled = true; verify(saved).catch(error => {status.textContent = error.message;}); }
</script>`);
  } catch (error) { res.writeHead(400); res.end(error.message); }
}).listen(8547, '127.0.0.1');
