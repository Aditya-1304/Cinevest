export async function readCampaignSnapshots<TSnapshot>(
  campaigns: readonly `0x${string}`[],
  getBlockNumber: () => Promise<bigint>,
  readAtBlock: (campaign: `0x${string}`, blockNumber: bigint) => Promise<TSnapshot>,
  concurrency = 8,
) {
  const blockNumber = await getBlockNumber();
  const snapshots: TSnapshot[] = [];
  const width = Number.isFinite(concurrency) ? Math.max(1, Math.min(8, Math.floor(concurrency))) : 8;
  const reads = new Map<string, Promise<TSnapshot>>();
  for (let start = 0; start < campaigns.length; start += width) {
    const batch = campaigns.slice(start, start + width);
    snapshots.push(...(await Promise.all(batch.map((campaign) => {
      const identity = campaign.toLowerCase();
      let read = reads.get(identity);
      if (!read) { read = readAtBlock(campaign, blockNumber); reads.set(identity, read); }
      return read;
    }))));
  }
  return { blockNumber, snapshots };
}
