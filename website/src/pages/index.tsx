import type {ReactNode} from 'react';
import Layout from '@theme/Layout';
import Hero from '@site/src/landing/hero/Hero';
import CodeShowcase from '@site/src/components/landing/CodeShowcase';
import FeatureGrid from '@site/src/components/landing/FeatureGrid';
import ShowcaseSection from '@site/src/components/landing/ShowcaseSection';
import EditorSection from '@site/src/components/landing/EditorSection';
import TutorialShowcase from '@site/src/components/landing/TutorialShowcase';

export default function Home(): ReactNode {
  return (
    <Layout
      title="Hybrid CAD"
      description="FluidCAD is hybrid CAD: model with the mouse, control it with code. Parametric modeling on the OpenCascade B-Rep kernel, with a feature tree, assemblies and STEP interop.">
      <main>
        <Hero />
        <CodeShowcase />
        <ShowcaseSection />
        <FeatureGrid />
        <EditorSection />
        <TutorialShowcase />
      </main>
    </Layout>
  );
}
