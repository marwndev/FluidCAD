import {useCallback, useEffect, useRef, useState} from 'react';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import BrowserOnly from '@docusaurus/BrowserOnly';
import {IconBrandGithub} from '@tabler/icons-react';
import {HERO_MODELS, type HeroModel} from './models';
import HeroViewport from './HeroViewport';
import styles from './Hero.module.css';

/** Width the overlaid layout needs before the copy can sit on the viewport. */
const OVERLAY_MIN_WIDTH = 1000;
/** The feature rail's own footprint inside the frame: 1.5rem inset + 220px. */
const RAIL_CLEARANCE_PX = 268;

export default function Hero() {
  const [activeId, setActiveId] = useState(HERO_MODELS[0].id);
  const active = HERO_MODELS.find((m) => m.id === activeId) ?? HERO_MODELS[0];

  const frameRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  // Matched synchronously on the client so the frame mounts with its final
  // chrome — a later flip re-keys the iframe and throws away a warm engine.
  const [overlaid, setOverlaid] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(min-width: ${OVERLAY_MIN_WIDTH}px)`).matches,
  );
  const [shift, setShift] = useState({x: 0, y: 0});

  // The model is centred in the room left over between the feature rail, the
  // copy and the switcher, so nothing the page draws lands on the geometry.
  const measure = useCallback((isOverlaid: boolean) => {
    const frame = frameRef.current;
    const copy = copyRef.current;
    const switcher = switcherRef.current;
    if (!frame || !copy || !switcher) {
      return;
    }
    if (!isOverlaid) {
      setShift({x: 0, y: 0});
      return;
    }
    const frameBox = frame.getBoundingClientRect();
    const clearCentre = (RAIL_CLEARANCE_PX + (copy.getBoundingClientRect().left - frameBox.left)) / 2;
    setShift({
      x: Math.max(0, Math.round(frameBox.width / 2 - clearCentre)),
      // Half the band the switcher occupies: lifting by that much re-centres
      // the model in what is left of the frame.
      y: Math.round(switcher.getBoundingClientRect().height / 2),
    });
  }, []);

  useEffect(() => {
    const wide = window.matchMedia(`(min-width: ${OVERLAY_MIN_WIDTH}px)`);
    const sync = () => {
      setOverlaid(wide.matches);
      measure(wide.matches);
    };
    sync();
    wide.addEventListener('change', sync);
    const observer = new ResizeObserver(() => measure(wide.matches));
    for (const el of [frameRef.current, switcherRef.current]) {
      if (el) {
        observer.observe(el);
      }
    }
    return () => {
      wide.removeEventListener('change', sync);
      observer.disconnect();
    };
  }, [measure]);

  return (
    <section className={styles.hero}>
      <div ref={frameRef} className={styles.frame}>
        <BrowserOnly fallback={<PosterFallback model={active} />}>
          {() => (
            <HeroViewport
              className={styles.viewportLayer}
              model={active}
              withTimeline={overlaid}
              viewShiftX={shift.x}
              viewShiftY={shift.y}
            />
          )}
        </BrowserOnly>

        <div ref={copyRef} className={styles.copy}>
          <Heading as="h1" className={styles.title}>
            Model with the mouse.
            <br />
            Control it with code.
          </Heading>
          <p className={styles.sub}>
            FluidCAD is hybrid CAD. Sketch, extrude, fillet and the rest by clicking, then drop
            into JavaScript for what a dialog cannot say. One file, on the OpenCascade B-Rep
            kernel.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primary} to="/docs/getting-started">
              Get started
            </Link>
            <Link className={styles.secondary} href="https://github.com/Fluid-CAD/FluidCAD">
              <IconBrandGithub size={18} stroke={1.75} aria-hidden />
              View the source
            </Link>
          </div>
        </div>

        <div ref={switcherRef} className={styles.switcher} role="group" aria-label="Choose a model">
          {HERO_MODELS.map((model) => (
            <button
              key={model.id}
              type="button"
              className={styles.chip}
              aria-pressed={model.id === activeId}
              onClick={() => setActiveId(model.id)}>
              <img className={styles.chipThumb} src={model.thumbnail} alt="" width={256} height={256} />
              <span className={styles.chipText}>
                <span className={styles.chipLabel}>{model.label}</span>
                <span className={styles.chipBlurb}>{model.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** What the server renders, and what a browser without JS keeps. */
function PosterFallback({model}: {model: HeroModel}) {
  return (
    <div className={`${styles.viewportLayer} ${styles.fallback}`}>
      <img src={model.poster} alt={model.posterAlt} width={1500} height={1000} />
    </div>
  );
}
