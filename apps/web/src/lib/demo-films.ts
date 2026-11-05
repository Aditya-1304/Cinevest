export type DemoFilm = {
  id: string;
  title: string;
  genre: string;
  creator: string;
  description: string;
  status: "Funding" | "Released";
  tone: "blue" | "rose" | "gold";
  raised: string;
  goal: string;
  progress: number;
  share: string;
  cap: string;
  deadline: string;
  deadlineDate: string;
  price: string;
  poster: string;
};

const films: DemoFilm[] = [
  {
    id: "the-last-monsoon",
    title: "The Last Monsoon",
    genre: "Drama",
    creator: "Ayla Fernandes",
    description:
      "A fisherman's daughter races to document her village's final flood season before the sea takes it for good.",
    status: "Funding",
    tone: "blue",
    raised: "6,200",
    goal: "12,000",
    progress: 52,
    share: "20%",
    cap: "1.5x",
    deadline: "Dec 20, 2026",
    deadlineDate: "2026-12-20",
    price: "2",
    poster:
      "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=900&q=75",
  },
  {
    id: "after-the-lights",
    title: "After the Lights",
    genre: "Drama",
    creator: "Marco Delgado",
    description:
      "A retired stage actor reassembles her old troupe for one unannounced midnight performance.",
    status: "Released",
    tone: "rose",
    raised: "9,400",
    goal: "9,000",
    progress: 100,
    share: "18%",
    cap: "1.3x",
    deadline: "Funded Sep 2026",
    deadlineDate: "2026-09-14",
    price: "2",
    poster:
      "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=900&q=75",
  },
  {
    id: "salt-roads",
    title: "Salt Roads",
    genre: "Documentary",
    creator: "Imani Okafor",
    description:
      "Three harvesters follow the ancient salt caravan routes across the desert one last trading season.",
    status: "Funding",
    tone: "gold",
    raised: "3,100",
    goal: "8,500",
    progress: 36,
    share: "22%",
    cap: "1.6x",
    deadline: "Feb 10, 2027",
    deadlineDate: "2027-02-10",
    price: "2",
    poster:
      "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=900&q=75",
  },
];

export const demoFilms = films;
export function getDemoFilm(id: string) {
  return demoFilms.find((film) => film.id === id);
}
