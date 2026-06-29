import React from 'react';
import {AbsoluteFill} from 'remotion';
import './hero.css';

const SocialIcon = ({label}: {label: string}) => <div className="social-icon">{label}</div>;

const ProductRow = ({
  icon,
  title,
  price,
  muted,
}: {
  icon: string;
  title: string;
  price: string;
  muted?: boolean;
}) => (
  <div className={`product-row ${muted ? 'muted' : ''}`}>
    <div className="row-icon">{icon}</div>
    <div>
      <strong>{title}</strong>
      <span>{price}</span>
    </div>
  </div>
);

const OrbitBadge = ({
  className,
  title,
  children,
}: {
  className: string;
  title: string;
  children: React.ReactNode;
}) => (
  <div className={`orbit-badge ${className}`}>
    <div className="orbit-visual">{children}</div>
    <strong>{title}</strong>
  </div>
);

export const OfferLabHero = () => {
  return (
    <AbsoluteFill className="hero-art">
      <div className="grain" />
      <div className="sweep sweep-one" />
      <div className="sweep sweep-two" />

      <div className="rear-card">
        <div className="marble" />
        <div className="revenue">
          <span>Ventes aujourd'hui</span>
          <strong>3 284 EUR</strong>
          <div className="cards">
            <i />
            <i />
          </div>
        </div>
      </div>

      <div className="creator-card">
        <div className="card-shine" />
        <div className="creator-header">
          <h1>OfferLab</h1>
          <div className="socials">
            <SocialIcon label="yt" />
            <SocialIcon label="tk" />
            <SocialIcon label="ig" />
            <SocialIcon label="in" />
          </div>
        </div>

        <div className="portrait">
          <div className="hair" />
          <div className="neck" />
          <div className="face">
            <div className="brow left" />
            <div className="brow right" />
            <div className="eye left" />
            <div className="eye right" />
            <div className="nose" />
            <div className="mouth" />
          </div>
          <div className="ear left" />
          <div className="ear right" />
          <div className="blazer" />
          <div className="shirt" />
        </div>
      </div>

      <div className="featured-offer">
        <div className="course-cover">
          <i />
          <i />
          <i />
        </div>
        <div className="offer-copy">
          <strong>Programme Signature</strong>
          <span>Transformer ton expertise en offre premium en 30 jours.</span>
          <div className="price-line">
            <b>997 EUR</b>
            <em>1 497 EUR</em>
            <mark>4.9</mark>
            <small>-33%</small>
          </div>
        </div>
        <div className="offer-cta">
          Demarrer
          <span>{'->'}</span>
        </div>
      </div>

      <div className="floating-list">
        <ProductRow icon="31" title="Audit conversion 1:1" price="249 EUR" />
        <ProductRow icon="PDF" title="Guide offre premium" price="29 EUR" muted />
      </div>

      <OrbitBadge className="calendar-badge" title="Calendrier">
        <div className="calendar-icon">
          <span>31</span>
        </div>
      </OrbitBadge>

      <OrbitBadge className="download-badge" title="Downloads">
        <div className="download-icon">
          <span />
        </div>
      </OrbitBadge>

      <OrbitBadge className="course-badge" title="Cours">
        <div className="cap">
          <i />
        </div>
        <div className="pen" />
      </OrbitBadge>

      <div className="brand-chip">
        <span>O</span>
        <strong>OfferLab</strong>
        <em>Infopreneur Store System</em>
      </div>
    </AbsoluteFill>
  );
};
