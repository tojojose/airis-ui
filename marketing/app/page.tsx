const productUrl = 'https://app.trominos.com';

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Airis home">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>AIRIS</span>
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#platform">Platform</a>
          <a href="#compliance">Compliance intelligence</a>
          <a href="#industries">Industries</a>
          <a href="#connect">Connect</a>
        </nav>
        <div className="header-actions">
          <a className="text-link" href={productUrl}>Sign in</a>
          <a className="button button-small" href="#contact">Book a pilot</a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> HUMAN-LED VISUAL INTELLIGENCE</p>
          <h1>See potential risks <em>before</em> they become incidents.</h1>
          <p className="hero-lede">
            Airis analyzes construction images and video against the rules that apply where you operate—then gives qualified reviewers explainable findings, evidence, and confidence scores.
          </p>
          <div className="hero-actions">
            <a className="button" href="#contact">Book a construction pilot <span>→</span></a>
            <a className="button button-secondary" href={productUrl}>Open Airis <span>↗</span></a>
          </div>
          <p className="human-note"><b>Human in the loop.</b> Airis surfaces potential violations; authorized professionals make every final decision.</p>
        </div>

        <div className="hero-product" aria-label="Airis finding preview">
          <div className="product-topbar">
            <span className="mini-brand">AIRIS / SITE 04</span>
            <span className="live-pill"><i /> ANALYSIS COMPLETE</span>
          </div>
          <div className="site-scene">
            <div className="sky" />
            <div className="structure"><i /><i /><i /><i /></div>
            <div className="worker worker-one"><span /></div>
            <div className="worker worker-two"><span /></div>
            <div className="scan-box"><b>01</b><span>PPE REVIEW</span></div>
            <div className="scene-caption">MOBILE CAPTURE · PROJECT RIVERSIDE</div>
          </div>
          <article className="finding-card">
            <div className="finding-head"><span className="risk-dot" /><b>Potential PPE violation</b><span className="confidence">87% confidence</span></div>
            <p>Worker inside the active work zone may be missing required head protection.</p>
            <div className="citation"><span>RULE CONTEXT</span><b>OSHA 29 CFR 1926.100(a)</b></div>
            <div className="review-row"><span>Recommended for human review</span><button type="button">Review finding →</button></div>
          </article>
        </div>
      </section>

      <section className="signal-strip" aria-label="Airis platform capabilities">
        <p>ONE CONFIGURABLE ENGINE</p>
        <div><span>Images</span><i>+</i><span>Video</span><i>+</i><span>Regulatory knowledge</span><i>+</i><span>Human judgment</span></div>
      </section>

      <section className="section platform" id="platform">
        <div className="section-heading">
          <p className="eyebrow"><span /> THE AIRIS PLATFORM</p>
          <h2>From visual evidence to an informed human decision.</h2>
          <p>Airis brings visual models, approved knowledge, and accountable review into one traceable workflow.</p>
        </div>
        <div className="workflow-grid">
          {[
            ['01', 'Connect', 'Upload a site photo or connect mobile, CCTV, IP camera, drone, and API sources.'],
            ['02', 'Configure', 'Define the location, project, industry, inspection profile, and approved knowledge.'],
            ['03', 'Ground', 'Retrieve applicable country, state, local, industry, company, and site requirements.'],
            ['04', 'Analyze', 'A vision-language model examines the evidence in the context of those requirements.'],
            ['05', 'Review', 'A qualified person evaluates confidence, evidence, citations, and recommended follow-up.'],
          ].map(([number, title, copy]) => (
            <article className="workflow-card" key={number}>
              <span>{number}</span><h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="context-section" id="compliance">
        <div className="context-copy">
          <p className="eyebrow light"><span /> CONFIGURABLE COMPLIANCE CONTEXT</p>
          <h2>The right analysis starts with the right rules.</h2>
          <p>Airis builds a site-specific intelligence context by matching each inspection with applicable regulations, engineering requirements, industry standards, company policies, and project inputs. The analysis is grounded in the rules and operating conditions that matter for that location—not a generic checklist.</p>
          <ul className="context-points">
            <li><b>Traceable sources</b><span>Record the source and version used for every finding.</span></li>
            <li><b>Project-level control</b><span>Add customer policies, procedures, and licensed standards.</span></li>
            <li><b>Explainable review</b><span>Pair visual evidence with confidence and regulatory context.</span></li>
          </ul>
        </div>
        <div className="context-map" aria-label="Jurisdictional and operational requirements converge into a site-specific inspection context">
          <div className="jurisdiction-axis">
            <p><b>JURISDICTIONAL REQUIREMENTS</b><span>LOCATION →</span></p>
            <div className="jurisdiction-row">
              {['Country regulations','State / province','County / municipality'].map((label, index) => (
                <div key={label}><span>0{index + 1}</span><b>{label}</b><i>APPROVED SOURCE</i></div>
              ))}
            </div>
          </div>
          <div className="context-map-body">
            <div className="operational-axis">
              <p><b>OPERATING CONTEXT</b><span>SPECIFICITY ↓</span></p>
              {['Industry standards','Company policies','Project + site procedures'].map((label, index) => (
                <div key={label}><span>0{index + 1}</span><b>{label}</b><i>APPROVED SOURCE</i></div>
              ))}
            </div>
            <div className="context-core">
              <span>APPROVED CONTEXT</span>
              <h3>Site-specific inspection context</h3>
              <p>Applicable requirements selected for this project, location, operating environment, and inspection.</p>
              <div>REGULATIONS <i>+</i> ENGINEERING <i>+</i> POLICIES <i>+</i> PROCEDURES</div>
            </div>
          </div>
        </div>
      </section>

      <section className="campaign-section">
        <div className="campaign-image" role="img" aria-label="Construction professionals using Airis visual intelligence at an active site" />
        <div className="campaign-quote">
          <p>ASSISTIVE BY DESIGN</p>
          <blockquote>“AI finds the signal. People make the decision.”</blockquote>
          <span>Airis does not certify compliance or replace professional inspections. It helps qualified teams review more visual evidence with consistent context.</span>
        </div>
      </section>

      <section className="section use-cases" id="industries">
        <div className="section-heading split-heading">
          <div><p className="eyebrow"><span /> START WITH CONSTRUCTION</p><h2>Built for complex physical environments.</h2></div>
          <p>Construction is the first market. The same configurable engine can support safety, security, compliance, and operational monitoring wherever visual evidence matters.</p>
        </div>
        <div className="industry-grid">
          {[
            ['Construction + infrastructure','PPE, work zones, excavation, traffic control, site procedures.','01'],
            ['Government + public works','Repeatable visual review across projects, jurisdictions, and contractors.','02'],
            ['Manufacturing + warehouses','Unsafe behaviors, restricted areas, vehicle interaction, process deviations.','03'],
            ['Mining + heavy industry','Remote-site oversight, equipment zones, PPE, and operating procedures.','04'],
            ['Retail + distributed sites','Security, loss-prevention context, facility conditions, and operating standards.','05'],
            ['Utilities + energy','Field evidence, critical-area monitoring, and configurable inspection profiles.','06'],
          ].map(([title, copy, number]) => (
            <article key={title}><span>{number}</span><h3>{title}</h3><p>{copy}</p><i>EXPLORE USE CASE →</i></article>
          ))}
        </div>
      </section>

      <section className="inputs-section" id="connect">
        <div className="inputs-copy">
          <p className="eyebrow light"><span /> CONNECT YOUR VISUAL SOURCES</p>
          <h2>Use the cameras and workflows you already have.</h2>
          <p>Start with image analysis today and expand into scheduled or continuous visual monitoring as each deployment requires.</p>
        </div>
        <div className="input-list">
          {['Mobile phones','CCTV systems','IP cameras','Drone imagery','Image + video upload','API integration'].map((item, index) => <div key={item}><span>0{index + 1}</span><b>{item}</b><i>↗</i></div>)}
        </div>
      </section>

      <section className="review-section">
        <div className="review-intro">
          <p className="eyebrow"><span /> HUMAN IN THE LOOP</p>
          <h2>Confidence is evidence—not a verdict.</h2>
        </div>
        <div className="review-principles">
          <article><b>Potential finding</b><p>Airis clearly distinguishes an AI observation from a confirmed violation.</p></article>
          <article><b>Evidence + confidence</b><p>Reviewers see the visual basis, cited context, and model confidence together.</p></article>
          <article><b>Accountable decision</b><p>An authorized human approves, dismisses, or escalates every material finding.</p></article>
        </div>
      </section>

      <section className="final-cta" id="contact">
        <p>START WITH ONE SITE</p>
        <h2>Put your visual data to work.</h2>
        <span>Begin with one construction workflow and one measurable safety or compliance objective.</span>
        <div className="hero-actions"><a className="button light-button" href={productUrl}>Open Airis <b>↗</b></a><a className="pilot-link" href="#top">Plan a pilot <b>→</b></a></div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark"><i /><i /><i /></span><span>AIRIS</span></a>
        <p>Human-led visual intelligence by Trominos.</p>
        <div><a href="#platform">Platform</a><a href="#compliance">Compliance</a><a href="#industries">Industries</a><a href={productUrl}>Product sign in ↗</a></div>
        <small>© 2026 Trominos. Airis findings support human review and are not legal determinations.</small>
      </footer>
    </main>
  );
}
