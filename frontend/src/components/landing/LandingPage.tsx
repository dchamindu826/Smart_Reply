'use client';

import React from 'react';
import Link from 'next/link';
import BrandLogo from '@/components/layout/BrandLogo';

export default function LandingPage() {
  return (
    <div className="landing-wrap">
      {/* ─── Navigation Bar ─── */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="landing-nav-brand">
            <BrandLogo idSuffix="Landing" />
          </Link>

          <nav className="landing-links">
            <a href="#features">Features</a>
            <a href="#calls">WhatsApp Calls</a>
            <a href="#ai-bot">AI Assistant</a>
            <a href="#architecture">Architecture</a>
            <a href="#plans">Plans</a>
          </nav>

          <div className="landing-actions">
            <Link href="/login" className="btn pri landing-login-btn">
              <span>Sign In to Console</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero Section ─── */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-pill">
            <span className="landing-pill-dot" />
            <span>Official WhatsApp Business Cloud API Platform</span>
          </div>

          <h1 className="landing-title">
            The Multi-Company <span className="text-gradient">WhatsApp Chat & Call</span> Platform
          </h1>

          <p className="landing-sub">
            Empower your team with a shared multi-agent inbox, crystal-clear VoIP voice calling,
            24/7 AI-powered customer support, and targeted broadcast campaigns — all managed from a single high-performance console.
          </p>

          <div className="landing-hero-cta">
            <Link href="/login" className="btn pri landing-hero-btn">
              <span>Access Your Console</span>
              <span aria-hidden="true">→</span>
            </Link>
            <a href="#features" className="btn sec landing-hero-btn-sec">
              Explore Capabilities
            </a>
          </div>

          <div className="landing-trust-strip">
            <div className="trust-item">
              <b>&lt; 60s</b>
              <span>Average SLA Response</span>
            </div>
            <div className="trust-sep" />
            <div className="trust-item">
              <b>100 Seats</b>
              <span>Per Company Capacity</span>
            </div>
            <div className="trust-sep" />
            <div className="trust-item">
              <b>24/7</b>
              <span>Grounded AI Bot</span>
            </div>
            <div className="trust-sep" />
            <div className="trust-item">
              <b>100%</b>
              <span>Tenant Data Isolation</span>
            </div>
          </div>
        </div>

        {/* ─── Hero Visual Mockup ─── */}
        <div className="landing-hero-visual">
          <div className="visual-card">
            <div className="visual-card-header">
              <div className="dots">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <div className="visual-status-pill">
                <span className="status-indicator online" />
                <span>Smart Reply Live Console</span>
              </div>
              <div className="visual-call-pill">
                <span>📞 WhatsApp VoIP Active</span>
              </div>
            </div>

            <div className="visual-chat-body">
              <div className="mock-chat-bubble customer">
                <div className="sender">Customer · +94 77 123 4567</div>
                <div className="text">Hi, can I check the availability of your product and book a demo for tomorrow morning?</div>
                <div className="time">10:42 AM</div>
              </div>

              <div className="mock-chat-bubble bot">
                <div className="sender">🤖 LUMI AI Assistant (Auto-Reply)</div>
                <div className="text">
                  Hello! Yes, absolutely. We have an opening tomorrow at 10:30 AM with our solutions engineer.
                  I have assigned your request to agent <b>Chamindu</b>.
                </div>
                <div className="time">10:42 AM · Instant</div>
              </div>

              <div className="mock-chat-bubble agent">
                <div className="sender">Chamindu (Account Manager)</div>
                <div className="text">Confirmed! I have sent the invite to your WhatsApp and email. Looking forward to speaking!</div>
                <div className="time">10:43 AM · ✓✓</div>
              </div>

              <div className="mock-incoming-call">
                <div className="call-info">
                  <div className="call-avatar">📞</div>
                  <div>
                    <div className="call-name">Incoming WhatsApp Call</div>
                    <div className="call-num">+94 71 987 6543 · Routing to available agent</div>
                  </div>
                </div>
                <div className="call-actions">
                  <span className="btn-call-decline">Decline</span>
                  <span className="btn-call-accept">Answer Call</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Core Features ─── */}
      <section id="features" className="landing-section">
        <div className="section-head">
          <span className="section-tag">Enterprise Capabilities</span>
          <h2>Everything You Need to Scale WhatsApp Operations</h2>
          <p>Built from the ground up for companies demanding reliability, speed, and real-time collaboration.</p>
        </div>

        <div className="landing-grid-3">
          <div className="feature-card">
            <div className="feature-icon">💬</div>
            <h3>Multi-Agent Shared Inbox</h3>
            <p>
              Connect up to 100 team members to your official WhatsApp number. Includes auto-assignment,
              smart round-robin distribution, customer tagging, and private internal notes.
            </p>
          </div>

          <div id="calls" className="feature-card highlighted">
            <div className="feature-icon">📞</div>
            <h3>WhatsApp VoIP Voice Calls</h3>
            <p>
              Receive and place crystal-clear audio calls directly inside your web console and mobile app.
              Includes call transfers, forwarding, scheduled callbacks, and interactive voice routing (IVR).
            </p>
          </div>

          <div id="ai-bot" className="feature-card">
            <div className="feature-icon">🤖</div>
            <h3>24/7 Trained AI Assistant</h3>
            <p>
              Supercharge support with Claude and GPT models trained strictly on your documents, catalogues, and FAQs.
              Answers inquiries instantly and hands over complex cases to live human agents.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📢</div>
            <h3>Broadcast Campaigns & Templates</h3>
            <p>
              Send targeted promotional, utility, and reminder templates verified by Meta.
              Track open rates, click-throughs, and delivery statuses in real-time.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Analytics & Performance SLAs</h3>
            <p>
              Monitor team performance, agent response times, customer conversation volume,
              and call durations with comprehensive visual reports and CSV exports.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📱</div>
            <h3>Companion Mobile App</h3>
            <p>
              Never miss a high-priority customer message or call. Full-featured Android and iOS
              React Native app with native push notifications, break statuses, and offline mode.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Unified Console Architecture ─── */}
      <section id="architecture" className="landing-section alt-bg">
        <div className="section-head">
          <span className="section-tag">Unified Platform</span>
          <h2>One Portal. Dedicated Workspaces.</h2>
          <p>
            System administrators and company teams log in from the same unified portal and are automatically routed
            to their dedicated environment.
          </p>
        </div>

        <div className="landing-grid-2">
          <div className="arch-card admin">
            <div className="arch-badge">Super Admin Console · /admin</div>
            <h3>LUMI AI Platform Operations</h3>
            <p>Complete control over multi-company provisioning, infrastructure, and Meta credentials.</p>
            <ul className="arch-list">
              <li>✓ Provision customer companies & assign seat limits (up to 100)</li>
              <li>✓ Configure Meta App ID, App Secret, and Webhook verification</li>
              <li>✓ Onboard WhatsApp numbers via Embedded Signup or Direct IDs</li>
              <li>✓ Activate, prompt-engineer, and test company AI Bots with live simulators</li>
              <li>✓ Impersonate company manager accounts for fast support</li>
            </ul>
          </div>

          <div className="arch-card client">
            <div className="arch-badge">Company Workspace · /</div>
            <h3>Manager & Staff Team Console</h3>
            <p>Daily operational hub for responding to leads, making calls, and closing deals.</p>
            <ul className="arch-list">
              <li>✓ Full WhatsApp messaging thread with multimedia and voice notes</li>
              <li>✓ Live VoIP calling widget with audio recording playback</li>
              <li>✓ Custom quick replies, flow templates, and contact custom fields</li>
              <li>✓ Staff availability management, break tracking, and presence</li>
              <li>✓ Real-time activity feeds powered by WebSockets</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Plans & Pricing ─── */}
      <section id="plans" className="landing-section">
        <div className="section-head">
          <span className="section-tag">Flexible Deployment</span>
          <h2>Choose the Right Plan for Your Business</h2>
          <p>All plans include full tenant data isolation, daily backups, and Meta Cloud API integration.</p>
        </div>

        <div className="landing-grid-3">
          <div className="plan-card">
            <div className="plan-name">Starter</div>
            <div className="plan-price">Essential</div>
            <p className="plan-desc">Perfect for small teams starting with WhatsApp Business.</p>
            <ul className="plan-features">
              <li>Up to 5 Agent Seats</li>
              <li>Official WhatsApp Number Connection</li>
              <li>Shared Multi-Agent Inbox</li>
              <li>Standard Quick Replies</li>
              <li>Mobile App Access</li>
            </ul>
            <Link href="/login" className="btn sec plan-btn">Access Console</Link>
          </div>

          <div className="plan-card popular">
            <div className="popular-badge">Most Popular</div>
            <div className="plan-name">Growth & Pro</div>
            <div className="plan-price">Scale</div>
            <p className="plan-desc">For growing organizations needing voice calls and AI automation.</p>
            <ul className="plan-features">
              <li>Up to 25 Agent Seats</li>
              <li>WhatsApp VoIP Voice Calling & Forwarding</li>
              <li>24/7 AI Smart Bot (Trained on Company Docs)</li>
              <li>Broadcast Campaigns & Verified Templates</li>
              <li>Advanced SLA & Team Performance Analytics</li>
            </ul>
            <Link href="/login" className="btn pri plan-btn">Access Console</Link>
          </div>

          <div className="plan-card">
            <div className="plan-name">Enterprise</div>
            <div className="plan-price">Custom</div>
            <p className="plan-desc">For large companies requiring custom limits and dedicated infrastructure.</p>
            <ul className="plan-features">
              <li>Up to 100 Agent Seats</li>
              <li>Custom AI Knowledge Embeddings</li>
              <li>Priority Meta Graph API Throughput</li>
              <li>Dedicated Account Management</li>
              <li>On-premise / Private Cloud Hosting Options</li>
            </ul>
            <Link href="/login" className="btn sec plan-btn">Access Console</Link>
          </div>
        </div>
      </section>

      {/* ─── Final CTA Banner ─── */}
      <section className="landing-cta-banner">
        <div className="cta-banner-content">
          <h2>Ready to Supercharge Your WhatsApp Communications?</h2>
          <p>Sign in to your management console or contact LUMI AI to get your company onboarded.</p>
          <div className="cta-actions">
            <Link href="/login" className="btn pri landing-cta-btn">
              <span>Sign In to Console</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <BrandLogo idSuffix="Foot" />
            <p>Smart Reply by LUMI AI — The Next-Generation Multi-Company WhatsApp Management System.</p>
          </div>
          <div className="footer-links">
            <div>
              <b>Product</b>
              <a href="#features">Features</a>
              <a href="#calls">Voice Calls</a>
              <a href="#ai-bot">AI Bot</a>
              <a href="#plans">Plans</a>
            </div>
            <div>
              <b>Access</b>
              <Link href="/login">Unified Sign In</Link>
              <Link href="/admin">Super Admin Portal</Link>
              <Link href="/forgot-password">Reset Password</Link>
            </div>
            <div>
              <b>Company</b>
              <a href="https://lumi-automation.com" target="_blank" rel="noreferrer">LUMI AI</a>
              <a href="mailto:support@lumi-automation.com">Support</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© {new Date().getFullYear()} LUMI AI. All rights reserved.</div>
          <div className="footer-host">Hosted on secure dedicated infrastructure · Domain: smartreply.lumi-automation.com</div>
        </div>
      </footer>
    </div>
  );
}
