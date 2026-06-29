import {Composition} from 'remotion';
import {OfferLabHero} from './OfferLabHero';

export const Root = () => {
  return (
    <Composition
      id="OfferLabHero"
      component={OfferLabHero}
      durationInFrames={1}
      fps={30}
      width={1800}
      height={1400}
    />
  );
};
