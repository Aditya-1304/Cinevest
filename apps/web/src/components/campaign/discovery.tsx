"use client";
import { useState } from "react";
import { demoFilms } from "@/lib/demo-films";
import { FilmCard } from "./film-card";
import { LiveDiscovery } from "./live-discovery";

export function Discovery() {
  const [genre, setGenre] = useState("All");
  const [status, setStatus] = useState("All");
  const [deadline, setDeadline] = useState("");
  const films = demoFilms.filter(
    (film) =>
      (genre === "All" || film.genre === genre) &&
      (status === "All" || film.status === status) &&
      (!deadline || film.deadlineDate <= deadline),
  );
  return (
    <section
      className="bg-[linear-gradient(180deg,#030e14,#01060f_65%)] px-[var(--landing-gutter,6%)] py-[100px] text-white"
      id="discover"
    >
      <div className="flex flex-col justify-between gap-6 min-[761px]:flex-row min-[761px]:items-end">
        <div>
          <p className="text-xs font-bold text-[#d3ed05]">
            Stories looking for their people
          </p>
          <h2 className="my-5 text-[clamp(36px,5vw,58px)] leading-[1.08] font-bold tracking-[-.055em]">
            Discover independent film.
          </h2>
          <p className="leading-[1.7] text-white/70">
            Explore live testnet campaigns and fictional examples.
          </p>
        </div>
        <div className="flex flex-wrap gap-[15px] text-xs font-bold [&_input]:mt-2 [&_input]:block [&_input]:rounded-md [&_input]:border [&_input]:border-white/15 [&_input]:bg-[#072733] [&_input]:p-[9px] [&_select]:mt-2 [&_select]:block [&_select]:min-w-[130px] [&_select]:rounded-md [&_select]:border [&_select]:border-white/15 [&_select]:bg-[#072733] [&_select]:p-[10px]">
          <div className="grid gap-2">
            <span id="genre-label">Genre</span>
            <select
              aria-labelledby="genre-label"
              value={genre}
              onChange={(event) => setGenre(event.target.value)}
            >
              <option value="All">All</option>
              <option value="Drama">Drama</option>
              <option value="Documentary">Documentary</option>
            </select>
          </div>
          <div className="grid gap-2">
            <span id="stage-label">Stage</span>
            <select
              aria-labelledby="stage-label"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="All">All</option>
              <option value="Funding">Funding</option>
              <option value="Released">Released</option>
            </select>
          </div>
          <label>
            Deadline by{" "}
            <input
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </label>
        </div>
      </div>
      <LiveDiscovery
        key={`${genre}:${deadline}`}
        genre={genre}
        stage={status}
        deadline={deadline}
      />
      <h3 className="mt-10 text-lg font-semibold">Example campaigns</h3>
      <div className="mt-[38px] grid grid-cols-1 gap-6 min-[761px]:grid-cols-3">
        {films.map((film) => (
          <FilmCard key={film.id} film={film} />
        ))}
      </div>
      {films.length === 0 && <p>No example films match these filters.</p>}
    </section>
  );
}
