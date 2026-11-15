/**
 * Media Service - Delivers portfolio samples, creative images, brochures, and links
 * For BWB Media Omnichannel Bot
 */

const PORTFOLIO_DATA = {
  videoEditing: {
    title: '🎬 BWB Media Video Editing Portfolio',
    description: 'High-retention Reels, Shorts & Long-Form YouTube edits.',
    links: [
      { name: 'Instagram Portfolio', url: 'https://instagram.com/bwbmedia' },
      { name: 'Google Drive Showreel', url: 'https://drive.google.com/drive/folders/bwb-video-portfolio' },
      { name: 'YouTube Case Studies', url: 'https://youtube.com/@bwbmedia' }
    ],
    sampleImages: [
      'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80', // video editing timeline
      'https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=800&q=80'
    ]
  },
  metaAds: {
    title: '📈 Meta Ads (FB & Insta) Campaign Case Studies',
    description: 'ROAS 4x-8x campaigns for E-commerce, Real Estate, Clinics & Coaches.',
    links: [
      { name: 'Ad Creatives & ROAS Proof', url: 'https://bwbmedia.com/case-studies/meta-ads' },
      { name: 'Free Ads Audit Call', url: 'https://calendly.com/bwbmedia/15min-consultation' }
    ],
    sampleImages: [
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80' // ads performance dashboard
    ]
  },
  websiteDesign: {
    title: '💻 Website & Funnel Development Portfolio',
    description: 'Fast, high-converting landing pages, Shopify stores & business websites.',
    links: [
      { name: 'Live Web Projects', url: 'https://bwbmedia.com/portfolio' }
    ],
    sampleImages: [
      'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=800&q=80'
    ]
  },
  brochure: {
    title: '📄 BWB Media Complete Rate Card & Agency Deck',
    description: 'Our full scope of work, pricing packages, deliverables & SLA.',
    links: [
      { name: 'Download PDF Brochure', url: 'https://bwbmedia.com/docs/BWB-Media-Rate-Card.pdf' }
    ],
    sampleImages: []
  },
  meetingBooking: {
    title: '📞 Schedule a 1-on-1 Strategy Call with Founder',
    description: 'Book a 15-minute quick consultation call directly on Calendly.',
    links: [
      { name: 'Book 15-Min Meeting', url: 'https://calendly.com/bwbmedia/strategy-call' }
    ],
    sampleImages: []
  }
};

/**
 * Check if user message indicates an intent for media, portfolio, images or links
 */
function detectMediaRequest(text = '') {
  const lower = text.toLowerCase();

  // Booking / Meeting Call
  if (lower.includes('call') || lower.includes('meeting') || lower.includes('schedule') || lower.includes('zoom') || lower.includes('google meet')) {
    return {
      type: 'booking',
      data: PORTFOLIO_DATA.meetingBooking,
      formattedText: 
`📅 *Schedule a 1-on-1 Strategy Call:*
You can pick a convenient date & time directly from our calendar:
🔗 ${PORTFOLIO_DATA.meetingBooking.links[0].url}

Or let me know a time that works best for you and our team will call you!`
    };
  }

  // Rate Card / Brochure / PDF
  if (lower.includes('brochure') || lower.includes('rate card') || lower.includes('pdf') || lower.includes('deck') || lower.includes('catalog')) {
    return {
      type: 'brochure',
      data: PORTFOLIO_DATA.brochure,
      formattedText: 
`📄 *BWB Media Agency Deck & Rate Card:*
Here is our detailed service breakdown and pricing guide:
🔗 ${PORTFOLIO_DATA.brochure.links[0].url}

Feel free to review it, and I'm right here to answer any specific questions!`
    };
  }

  // Video Editing Sample
  if ((lower.includes('sample') || lower.includes('portfolio') || lower.includes('dekho') || lower.includes('dikhao') || lower.includes('showreel') || lower.includes('demo') || lower.includes('previous work')) &&
      (lower.includes('video') || lower.includes('reel') || lower.includes('short') || lower.includes('youtube') || lower.includes('edit'))) {
    return {
      type: 'video_portfolio',
      data: PORTFOLIO_DATA.videoEditing,
      imageUrl: PORTFOLIO_DATA.videoEditing.sampleImages[0],
      formattedText: 
`🎬 *BWB Media Video Editing Samples & Showreel:*
Here are some of our top-performing Reels & YouTube edits:

🔗 *Google Drive Showreel:* ${PORTFOLIO_DATA.videoEditing.links[1].url}
🔗 *Instagram Portfolio:* ${PORTFOLIO_DATA.videoEditing.links[0].url}

Which style are you looking for — Talking Head Reels, Faceless Cashcow, or High-Retention Storytelling?`
    };
  }

  // Meta Ads Sample
  if ((lower.includes('sample') || lower.includes('case study') || lower.includes('proof') || lower.includes('result') || lower.includes('portfolio')) &&
      (lower.includes('ad') || lower.includes('facebook') || lower.includes('meta') || lower.includes('campaign'))) {
    return {
      type: 'ads_portfolio',
      data: PORTFOLIO_DATA.metaAds,
      imageUrl: PORTFOLIO_DATA.metaAds.sampleImages[0],
      formattedText: 
`📈 *BWB Media Meta Ads Case Studies & ROAS Proof:*
Here is how we generated 4x-8x ROAS for our clients:

🔗 *Case Studies & Creatives:* ${PORTFOLIO_DATA.metaAds.links[0].url}
🔗 *Free 15-Min Ad Audit Call:* ${PORTFOLIO_DATA.metaAds.links[1].url}

Would you like us to audit your existing ad account or setup a brand new campaign?`
    };
  }

  // General Portfolio / Samples request
  if (lower.includes('sample') || lower.includes('portfolio') || lower.includes('kam dikhao') || lower.includes('kya kya kiya') || lower.includes('previous work')) {
    return {
      type: 'general_portfolio',
      data: PORTFOLIO_DATA.videoEditing,
      imageUrl: PORTFOLIO_DATA.videoEditing.sampleImages[0],
      formattedText: 
`🌟 *BWB Media Work & Case Studies:*
We specialize in High-Retention Video Editing, Meta Ads, and Funnels.

🔗 *Video Editing Showreel:* ${PORTFOLIO_DATA.videoEditing.links[1].url}
🔗 *Instagram Page:* ${PORTFOLIO_DATA.videoEditing.links[0].url}
🔗 *Full Agency Portfolio:* ${PORTFOLIO_DATA.websiteDesign.links[0].url}

Which specific service would you like to explore further?`
    };
  }

  return null;
}

module.exports = {
  PORTFOLIO_DATA,
  detectMediaRequest
};
