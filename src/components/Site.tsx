import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, CalendarDays, Menu, MessageCircle, Phone, ShieldCheck, Sparkles, X, MapPin, Info } from 'lucide-react';
import type { Meta } from '../types';
import { chatLink, formatTime, money, scrollTo } from '../lib';
import { Brand, ServiceIcon, WhatsAppIcon } from './Shared';
import { Booking } from './Booking';

export function Site({ meta, onPrivacy }: { meta: Meta; onPrivacy: () => void }) {
  const [selected, setSelected] = useState('car-wash');
  const [menuOpen, setMenuOpen] = useState(false);
  const { business } = meta;
  const selectService = (id: string) => { setSelected(id); scrollTo('book'); };
  const closeMenu = () => setMenuOpen(false);
  return <>
    <a className="skip-link" href="#book">Skip to booking</a>
    <div className="topline"><span>LOCAL CARE. STANDOUT SHINE.</span><span>Sanju bhaiya’s chair is ready for your car.</span><span className="topline-right">EST. IN YOUR NEIGHBOURHOOD <Sparkles size={12} /></span></div>
    <header className="site-header">
      <div className="container header-inner">
        <Brand onClick={closeMenu} />
        <nav className="desktop-nav" aria-label="Main navigation"><a href="#services">Our services</a><a href="#book">Book a slot</a><a href="#centre">The centre</a></nav>
        <a className="header-phone" href={`tel:${business.phone}`}><Phone size={17} /><span>Let’s talk</span><ArrowUpRight size={16} /></a>
        <button className="icon-button mobile-menu-button" aria-expanded={menuOpen} aria-controls="mobile-nav" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      </div>
      {menuOpen && <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation"><a href="#services" onClick={closeMenu}>Our services <ArrowRight size={18} /></a><a href="#book" onClick={closeMenu}>Book a slot <ArrowRight size={18} /></a><a href="#centre" onClick={closeMenu}>The centre <ArrowRight size={18} /></a><a href={`tel:${business.phone}`}>Call {business.displayPhone} <Phone size={18} /></a></nav>}
    </header>

    <main>
      <section className="hero container" id="home">
        <div className="hero-copy">
          <div className="hero-eyebrow"><span className="little-sun"><Sparkles size={15} /></span> SANJU BHAIYA’S ICONIC CAR CARE</div>
          <h1>A cleaner car.<br />A <span className="highlight-word">better day.</span></h1>
          <p className="hero-description">A little care goes a long way. Get your car its shine back — at a time that works for you.</p>
          <div className="hero-actions"><a href="#book" className="button button-dark button-large">Find my slot <ArrowUpRight size={21} /></a><a href="#services" className="hero-secondary">Explore the menu <ArrowRight size={17} /></a></div>
          <div className="hero-note"><span className="note-icon"><WhatsAppIcon size={20} /></span><div><strong>Your booking. Straight to WhatsApp.</strong><span>No app downloads. No payment upfront.</span></div></div>
          <div className="hero-bottom"><span className="handwritten">Gaadi chamkegi. Mood banega.</span><svg viewBox="0 0 70 30" aria-hidden="true"><path d="M2 8C20 28 43 25 64 10M53 8l13-1-2 13" /></svg></div>
        </div>
        <div className="hero-visual">
          <div className="hero-photo-wrap"><img className="hero-photo" src="/images/iconic-wash.jpg" alt="Illustrative photo of a dark SUV receiving a foam wash in an open-sided car wash bay" fetchPriority="high" /><span className="photo-label">THE ICONIC KIND OF FRESH</span><div className="photo-caption"><span className="caption-dot" /> Care in every detail.<span className="photo-credit">Illustrative image</span></div></div>
          <div className="shine-sticker" aria-label="Good cars, great days"><Sparkles size={23} /><span>GOOD CARS.<br />GREAT DAYS.</span><span className="sticker-small">IT’S AN ICONIC THING.</span></div>
          <div className="hero-price-tag"><span>A FRESH START FROM</span><strong>₹150<span>/ car wash</span></strong><ArrowUpRight size={23} /></div>
        </div>
      </section>

      <div className="container benefits" aria-label="Booking benefits">
        <div><span className="benefit-icon"><ShieldCheck /></span><span><strong>Know the price</strong><small>Clear rates. No guessing.</small></span></div>
        <div><span className="benefit-icon"><CalendarDays /></span><span><strong>Your time, your slot</strong><small>Plan ahead, skip the guesswork.</small></span></div>
        <div><span className="benefit-icon"><MessageCircle /></span><span><strong>Direct to Sanju bhaiya</strong><small>Booking details on WhatsApp.</small></span></div>
      </div>

      <section className="services-section container section-space" id="services">
        <div className="section-heading"><div><span className="eyebrow">THE CARE MENU</span><h2>Pick your kind of clean.</h2></div><p>From a quick refresh to the full VIP treatment.<br className="hidden md:block" /> Honest prices, straight from our rate board.</p></div>
        <div className="service-grid">
          {meta.services.map((service, index) => <article key={service.id} className={`service-card ${service.id === 'vip' ? 'service-card-vip' : ''} ${selected === service.id ? 'service-selected' : ''}`}>
            <div className="service-card-top"><span className="service-icon"><ServiceIcon name={service.icon} size={27} /></span><span className="service-tag">{service.tag}</span></div>
            <div className="service-title-row"><h3>{service.name}</h3><span className="service-number">0{index + 1}</span></div>
            <p>{service.description}</p>
            <div className="service-price-row"><strong>{money(service.price)}</strong><span><Clock3 size={14} /> {service.minutes} min{!meta.live && <span className="demo-mini">demo</span>}</span></div>
            <button className="service-select" onClick={() => selectService(service.id)} aria-label={`Choose ${service.name}, ${money(service.price)}`}><span>{selected === service.id ? 'Selected for booking' : 'Choose this service'}</span>{selected === service.id ? <Check size={19} /> : <ArrowUpRight size={20} />}</button>
          </article>)}
        </div>
        <div className="more-services"><div><span className="more-icon"><MessageCircle size={20} /></span><p><strong>Something else in mind?</strong><span>{meta.askAtCentre.join(' · ')} — ask us for rates.</span></p></div><a href={chatLink(business.whatsapp, 'Namaste Sanju bhaiya! Please share the rates and timing for interior wash, engine cleaning, foam wash and bike wash.')} target="_blank" rel="noopener noreferrer" className="text-link">Ask on WhatsApp <ArrowUpRight size={17} /></a></div>
        <p className="menu-footnote"><Info size={13} /> Prices are from the centre’s shared poster. {meta.live ? 'Service durations are estimates set by the owner.' : 'Displayed durations are demo estimates, not confirmed shop timings.'}</p>
      </section>

      <Booking meta={meta} serviceId={selected} onChangeService={setSelected} onPrivacy={onPrivacy} />

      <section className="how-section container section-space">
        <div className="section-heading"><div><span className="eyebrow">LESS WAITING. MORE LIVING.</span><h2>Three steps. One happy car.</h2></div><span className="small-stamp"><Check size={17} /> SIMPLE BY DESIGN</span></div>
        <div className="steps-grid">
          <article><span className="step-number">01</span><div className="step-line" /><h3>Pick your care.</h3><p>Choose a service from the menu. See the price and estimated time before you book.</p><span className="step-caption"><Sparkles size={16} /> A treat for your car</span></article>
          <article><span className="step-number">02</span><div className="step-line" /><h3>Make time for shine.</h3><p>Pick a date and an available slot. Add your details so Sanju bhaiya knows who’s coming.</p><span className="step-caption"><CalendarDays size={16} /> On your schedule</span></article>
          <article><span className="step-number">03</span><div className="step-line" /><h3>Send. Get confirmed.</h3><p>Tap the WhatsApp button and send your booking. The centre checks it and confirms your slot.</p><span className="step-caption"><WhatsAppIcon size={16} /> Direct, personal, easy</span></article>
        </div>
      </section>

      <section className="centre-section" id="centre"><div className="container centre-grid">
        <div className="centre-photo"><img src="/images/iconic-signboard.jpg" alt="The yellow Iconic Car Washing Centre signboard supplied by the shop" loading="lazy" /><span><MapPin size={14} /> A REAL NEIGHBOURHOOD KIND OF CARE</span></div>
        <div className="centre-copy"><span className="eyebrow">MEET YOUR CAR’S NEW HAPPY PLACE</span><h2>Local hands.<br />Iconic results.</h2><p>Welcome to Sanju bhaiya’s <strong>Iconic Car Washing Centre</strong>. The care you know, now with a simpler way to plan your visit.</p><div className="centre-contact"><span className="contact-icon"><Phone size={22} /></span><div><span>CALL US / LET’S TALK</span><a href={`tel:${business.phone}`}>{business.displayPhone}</a></div></div><div className="centre-hours"><Clock3 size={18} /><span>{meta.live ? `${formatTime(meta.settings.opening)} – ${formatTime(meta.settings.closing)} · IST` : 'Shop hours will be updated by the centre.'}{meta.live && meta.settings.weeklyOff.length > 0 && <small>Weekly off: {meta.settings.weeklyOff.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}</small>}</span></div><a className="button button-dark" href={chatLink(business.whatsapp)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon /> Say hello on WhatsApp <ArrowUpRight size={18} /></a><p className="location-note">Exact address and directions: please ask the centre.</p></div>
      </div></section>

      <section className="container faq-section section-space"><div><span className="eyebrow">GOOD TO KNOW</span><h2>A few quick<br />answers.</h2><p>Still wondering about something?<br /><a href={chatLink(business.whatsapp)} target="_blank" rel="noopener noreferrer" className="text-link">Just ask Sanju bhaiya <ArrowUpRight size={16} /></a></p></div><div className="faq-list">
        <details><summary>Is my slot confirmed as soon as I book?<ChevronDown size={19} /></summary><p>Not yet. Send the ready-made message on WhatsApp, then wait for Sanju bhaiya to confirm. A new website request holds the slot for {meta.holdMinutes} minutes; unsent and unconfirmed requests expire. In demo mode, no real slot or message is created.</p></details>
        <details><summary>Do I need to pay online?<ChevronDown size={19} /></summary><p>No. All displayed prices are payable at the centre. There is no online payment or booking fee on this website.</p></details>
        <details><summary>Can I book a bike wash or engine cleaning?<ChevronDown size={19} /></summary><p>These services are on the centre’s signboard, but their prices and durations haven’t been confirmed for online booking. Please call or WhatsApp the centre before choosing a slot.</p></details>
        <details><summary>What if my plans change?<ChevronDown size={19} /></summary><p>Call or WhatsApp {business.displayPhone} with your booking reference. The owner can cancel or help you make a new booking. Please give the centre as much notice as possible.</p></details>
        <details><summary>A note about vehicle care<ChevronDown size={19} /></summary><p>The centre’s original notice says it does not accept responsibility for any breakage or damage. Please inspect your vehicle and discuss any existing issues with the team before service. <a href="/images/shop-rate-board.jpg" target="_blank" rel="noopener noreferrer">View the original rate board ↗</a></p></details>
      </div></section>
    </main>

    <footer className="site-footer"><div className="container"><div className="footer-main"><div><Brand light /><p>Gaadi ki care. Apno wali.</p></div><div className="footer-cta">Your next good day<br />starts with a clean car.<a href="#book" aria-label="Go to booking"><ArrowUpRight size={34} /></a></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Iconic Car Washing Centre</span><div><button onClick={onPrivacy}>Privacy & booking terms</button><a href="/admin">Owner dashboard <ArrowUpRight size={13} /></a></div><span className="footer-made">MADE FOR THE EVERYDAY DRIVE.</span></div></div></footer>
    <a className="floating-chat" href={chatLink(business.whatsapp)} target="_blank" rel="noopener noreferrer" aria-label="Chat with Iconic on WhatsApp"><WhatsAppIcon size={24} /><span>Let’s talk</span></a>
  </>;
}
