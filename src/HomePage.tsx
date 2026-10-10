import { PLATFORMS } from './data';
import { RETAILERS } from './data/retailers';
import { bestOffer, money, presetSelection, baseSelection, toBuild } from './engine';
import { Blueprint } from './drawings';
import { statesFor } from './status';
import { buildOf, totalOf } from './store';
import { biggestDrops } from './data/history';
import { FAQ_PICKS } from './guides/picks';
import type { Part } from './types';
import { FAMILIES } from './ui';

export function HomePage({ onPick, onStart, onBrowse }: { onPick: (id: string, part?: Part) => void; onStart: () => void; onBrowse: () => void }) {
  // Shared add-ons (lights, cases) are listed under several platforms; count each once.
  const partCount = new Set(PLATFORMS.flatMap((p) => p.parts.map((x) => x.id))).size;
  const drops = biggestDrops(PLATFORMS.flatMap((p) => p.parts));
  const hero = buildOf('ar15', baseSelection(PLATFORMS.find((p) => p.id === 'ar15')!));
  return (
    <div className="home">
      <section className="hero">
        <div className="wrap hero-row">
          <div className="hero-copy">
            <p className="kicker">Plan It Before You Buy It</p>
            <h1>Build Your Next Rifle or Pistol, Part by Part</h1>
            <p className="lede">Pick a platform, choose every part, and we check that it all fits and show where each part costs least. We don't sell anything.</p>
            <div className="hero-actions">
              <button className="btn primary big" onClick={onStart}>Start a Build</button>
              <button className="btn big" onClick={onBrowse}>Browse Community Builds</button>
            </div>
            <p className="hero-facts">{PLATFORMS.length} platforms · {partCount} parts · {Object.keys(RETAILERS).length} retailers compared</p>
          </div>
          <div className="hero-art thumb" aria-hidden="true">
            <Blueprint platform={hero.platform} build={hero.build} place={hero.place} states={statesFor(hero.platform, hero.build, hero.place).states} compact />
          </div>
        </div>
      </section>

      <div className="wrap">
        <section className="home-section">
          <h2 className="home-h2">Pick a Platform</h2>
          {FAMILIES.map((fam) => (
            <div className="tile-family" key={fam}>
              <p className="tile-fam">{fam}s</p>
              <div className={'tile-grid ' + fam.toLowerCase()}>
                {PLATFORMS.filter((p) => p.family === fam).map((p) => {
                  const starter = buildOf(p.id, baseSelection(p));
                  const from = totalOf(p, toBuild(p, presetSelection(p, 'budget')));
                  return (
                    <button className="tile card" key={p.id} onClick={() => onPick(p.id)}>
                      <span className="thumb">
                        <Blueprint platform={p} build={starter.build} place={starter.place} states={statesFor(p, starter.build, starter.place).states} compact />
                      </span>
                      <span className="tile-body">
                        <span className="tile-maker">{p.maker}</span>
                        <span className="tile-name">{p.name}</span>
                        <span className="tile-blurb">{p.blurb}</span>
                        <span className="tile-from">Starter builds from <b>{money(from)}</b></span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="platform-pages">Parts lists and prices by platform: <a href="./build/">See All Platforms</a></p>
        </section>

        {drops.length > 0 && (
          <section className="home-section">
            <h2 className="home-h2">Price Drops This Week</h2>
            <ul className="drops">
              {drops.map(({ part, was, now, by }) => {
                const platform = PLATFORMS.find((p) => p.parts.includes(part))!;
                return (
                  <li key={part.id}>
                    <button className="drop-card card" onClick={() => onPick(platform.id, part)}>
                      <span className="drop-name"><span className="brand-dim">{part.brand}</span> {part.name}</span>
                      <span className="drop-meta">{platform.name} · {RETAILERS[bestOffer(part)!.retailer].name}</span>
                      <span className="drop-price">
                        <s>{money(was)}</s> <b>{money(now)}</b>
                        <span className="change-chip down">↓ {money(by)} ({Math.round((by / was) * 100)}%)</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="home-section">
          <h2 className="home-h2">How It Works</h2>
          <ol className="steps">
            <li className="card"><b>Pick a Platform</b><span>Start blank, or from a budget, value or premium build that already fits together.</span></li>
            <li className="card"><b>Choose Your Parts</b><span>Every part is checked against the rest of the build. Anything that won't fit, or needs a second look, is flagged before you buy.</span></li>
            <li className="card"><b>Buy at the Best Price</b><span>See each part's price at every retailer we track, save the build, and get an email if a part drops in price.</span></li>
          </ol>
        </section>

        <section className="home-section home-split">
          <div className="card home-panel">
            <h2 className="home-h2">Community Builds</h2>
            <p>See what other builders put together, vote for the best ones, and open any build to make it your own.</p>
            <button className="btn" onClick={onBrowse}>Browse Community Builds</button>
          </div>
          <div className="card home-panel">
            <h2 className="home-h2">Common Questions</h2>
            <ul className="faq-links">
              {FAQ_PICKS.map((g) => <li key={g.slug}><a href={`./faq/${g.slug}/`}>{g.h1}</a></li>)}
            </ul>
            <a className="link" href="./faq/">See All Questions</a>
          </div>
        </section>
      </div>
    </div>
  );
}
