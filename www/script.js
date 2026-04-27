/**
 * micro:bit Serial Logger
 * USB Serial communication with chunked transfer and retry mechanism
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════
const CONFIG = {
  baudRate: 115200,
  chunkSize: 50,  // Reduced from 64 for RGB reliability
  ackTimeout: 100, // Increased for reliable ACK handling
  retryDelay: 20, // Increased for stability
  maxRetries: 10,
  maxSeq: 1000
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ═══════════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════════
const dom = {
  connectBtn: document.getElementById('connectBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  sendBtn: document.getElementById('sendBtn'),
  testBtn: document.getElementById('testBtn'),
  clearStatsBtn: document.getElementById('clearStatsBtn'),
  messageInput: document.getElementById('messageInput'),
  // Emoji UI
  emojiList: document.getElementById('emojiList'),
  emojiMatrix: document.getElementById('emojiMatrix'),
  sendEmojiBtn: document.getElementById('sendEmojiBtn'),
  matrixSize: document.getElementById('matrixSize'),
  brightnessSlider: document.getElementById('brightnessSlider'),
  brightnessValue: document.getElementById('brightnessValue'),
  simpleModeToggle: document.getElementById('simpleModeToggle'),
  brushColor: document.getElementById('brushColor'),
  // Preview controls
  clearPreviewBtn: document.getElementById('clearPreviewBtn'),
  testRedBtn: document.getElementById('testRedBtn'),
  testGreenBtn: document.getElementById('testGreenBtn'),
  testBlueBtn: document.getElementById('testBlueBtn'),
  testWhiteBtn: document.getElementById('testWhiteBtn'),
  // Save/Load
  saveNameInput: document.getElementById('saveNameInput'),
  saveDesignBtn: document.getElementById('saveDesignBtn'),
  savedDesignsList: document.getElementById('savedDesignsList'),
  noSavedDesigns: document.getElementById('noSavedDesigns'),
  // Demos
  demoWavingFlag: document.getElementById('demoWavingFlag'),
  demoTrafficLight: document.getElementById('demoTrafficLight'),
  demoHeartBeat: document.getElementById('demoHeartBeat'),
  demoSpinningStar: document.getElementById('demoSpinningStar'),
  demoRainbowWave: document.getElementById('demoRainbowWave'),
  demoSmiley: document.getElementById('demoSmiley'),
  demoLoadingBar: document.getElementById('demoLoadingBar'),
  demoFireworks: document.getElementById('demoFireworks'),
  demoRacingCar: document.getElementById('demoRacingCar'),
  demoStopSign: document.getElementById('demoStopSign'),
  demoBlinkingEye: document.getElementById('demoBlinkingEye'),
  stopDemo: document.getElementById('stopDemo'),
  logContainer: document.getElementById('logContainer'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  copyLogBtn: document.getElementById('copyLogBtn'),
  exportLogBtn: document.getElementById('exportLogBtn'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  statusPill: document.getElementById('statusPill')
};

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════
let port = null;
let reader = null;
let writer = null;
let isConnected = false;
let rxBuffer = '';
let sendInProgress = false;

// Emoji state
let selectedEmoji = null;
let selectedEmojiHex = null; // hex for RGBMOJI (size-dependent)

// ACK state
let awaitingPayload = null;
let awaitingResolve = null;
let awaitingReject = null;
let awaitingTimer = null;

// Test statistics
let stats = {
  chunks: 0,
  retries: 0,
  maxRetryPerChunk: 0
};

// Cumulative statistics
let cumulative = {
  tests: 0,
  bytes: 0,
  chunks: 0,
  retries: 0,
  time: 0,
  minSpeed: Infinity,
  maxSpeed: 0,
  minRetries: Infinity,
  maxRetries: 0,
  maxRetryPerChunk: 0
};

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timestamp = () => `[${new Date().toLocaleTimeString()}]`;

// ═══════════════════════════════════════════════════════════════════
// EMOJI → 16x16 BITMAP
// - We render the emoji to an offscreen canvas, sample it into 16x16,
//   then encode as 64 hex chars (256 bits).
// - Payload over serial: EMOJI:<64hex>
// ═══════════════════════════════════════════════════════════════════

const EMOJI_LIBRARY = {
  '😀 Basic': [
    '😀','😃','😄','😁','😎','🥳','😍','🤖','👻','💀','👽','🎃',
    '❤️','💛','💚','💙','💜','⭐','⚡','🔥','❄️','🌈','🍀','🍕',
    '🍎','🍌','🍓','🍉','🎈','🎉','🎮','🎵','🚀','🧠','✅','❌'
  ],
  '🤖 Robots': [
    '🤖','👾','🛸','🦾','🦿','💡','🔋','⚙️','🔧','🔨','🪛','⚒️',
    '🛠️','🔩','⛓️','🧲','📡','📻','💻','⌨️','🖥️','📱','🖱️','💾'
  ],
  '🚗 Vehicles': [
    '🚗','🚙','🚕','🏎️','🚓','🚑','🚒','🚜','🦼','🦽','🛴','🛹',
    '🚲','🏍️','🛵','✈️','🚁','🛩️','🚂','🚃','🚄','🚅','🚆','🚇'
  ],
  '🔧 Tools': [
    '🔧','🔨','🪛','⚒️','🛠️','🪚','🪓','✂️','📏','📐','🧰','🗜️',
    '⛏️','🔪','🪒','🧪','🔬','🔭','⚗️','🧬','💉','🌡️','🧯','🪝'
  ],
  '🔴 Symbols': [
    '🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸',
    '🔺','🔻','💠','🔘','⏺️','⏸️','⏹️','⏩','⏪','⏫','⏬','▶️',
    '◀️','🔼','🔽','⏏️','⚠️','☢️','☣️','⛔','🚫','❗','❓','💯'
  ],
  '🏴 Flags': [
    '🇫🇷','🇺🇸','🇬🇧','🇩🇿','🇵🇸','🇹🇳','🇲🇦','🇪🇬','🇶🇦','🇿🇦',
    '🇮🇪','🇪🇸','🇮🇹','🏴','🏳️','🏁','🚩','🏴‍☠️'
  ],
  '🛑 Road Signs': [
    '🛑','⚠️','🚸','⛔','🚫','🚷','🚳','🚭','🚯','🚱',
    '🚰','♿','🅿️','🚏','🛤️','🚦','🚥','⛽','🏧','ℹ️',
    '🆘','🆗','🆙','🆕','🆓','🔞','📵','🔇','🔕','⏸️',
    '⏹️','⏺️','⏏️','⏮️','⏭️','⏯️','🔁','🔂','◀️','▶️'
  ]
};

// Emoji descriptions for better understanding
const EMOJI_DESCRIPTIONS = {
  // Basic
  '😀': 'Grinning Face - Happy smile',
  '😃': 'Grinning Face with Big Eyes',
  '😄': 'Grinning Face with Smiling Eyes',
  '😁': 'Beaming Face - Big grin',
  '😎': 'Smiling Face with Sunglasses - Cool',
  '🥳': 'Partying Face - Celebration',
  '😍': 'Smiling Face with Heart-Eyes - Love',
  '🤖': 'Robot Face - Technology',
  '👻': 'Ghost - Spooky',
  '💀': 'Skull - Danger or Halloween',
  '👽': 'Alien - Extraterrestrial',
  '🎃': 'Jack-O-Lantern - Halloween pumpkin',
  '❤️': 'Red Heart - Love',
  '💛': 'Yellow Heart - Friendship',
  '💚': 'Green Heart - Nature',
  '💙': 'Blue Heart - Trust',
  '💜': 'Purple Heart - Magic',
  '⭐': 'Star - Excellence',
  '⚡': 'Lightning Bolt - Power/Energy',
  '🔥': 'Fire - Hot or trending',
  '❄️': 'Snowflake - Cold or winter',
  '🌈': 'Rainbow - Colorful',
  '🍀': 'Four Leaf Clover - Good luck',
  '🍕': 'Pizza - Food',
  '🍎': 'Red Apple - Fruit or health',
  '🍌': 'Banana - Fruit',
  '🍓': 'Strawberry - Berry fruit',
  '🍉': 'Watermelon - Summer fruit',
  '🎈': 'Balloon - Party',
  '🎉': 'Party Popper - Celebration',
  '🎮': 'Video Game Controller - Gaming',
  '🎵': 'Musical Note - Music',
  '🚀': 'Rocket - Space or fast',
  '🧠': 'Brain - Intelligence',
  '✅': 'Check Mark - Correct/Done',
  '❌': 'Cross Mark - Wrong/Error',
  
  // Road Signs
  '🛑': 'STOP Sign - Arrêt obligatoire',
  '⚠️': 'Warning Sign - Attention danger',
  '🚸': 'Children Crossing - Passage piétons',
  '⛔': 'No Entry - Interdiction d\'entrer',
  '🚫': 'Prohibited - Interdit',
  '🚷': 'No Pedestrians - Piétons interdits',
  '🚳': 'No Bicycles - Vélos interdits',
  '🚭': 'No Smoking - Défense de fumer',
  '🚯': 'No Littering - Ne pas jeter',
  '🚱': 'Non-Potable Water - Eau non potable',
  '🚰': 'Potable Water - Eau potable',
  '♿': 'Wheelchair Symbol - Accès handicapés',
  '🅿️': 'Parking Sign - Stationnement',
  '🚏': 'Bus Stop - Arrêt de bus',
  '🛤️': 'Railway Track - Voie ferrée',
  '🚦': 'Traffic Light Vertical - Feu tricolore',
  '🚥': 'Traffic Light Horizontal - Feu',
  '⛽': 'Fuel Pump - Station essence',
  '🏧': 'ATM Sign - Distributeur',
  'ℹ️': 'Information - Point info',
  '🆘': 'SOS Button - Urgence',
  '🆗': 'OK Button - Validation',
  '🆙': 'UP Button - Direction haut',
  '🆕': 'NEW Button - Nouveau',
  '🆓': 'FREE Button - Gratuit',
  '🔞': 'No One Under 18 - Interdit -18 ans',
  '📵': 'No Mobile Phones - Téléphone interdit',
  '🔇': 'Muted Speaker - Son coupé',
  '🔕': 'No Bell - Silencieux',
  
  // Flags
  '🇫🇷': 'France Flag - Drapeau français',
  '🇺🇸': 'USA Flag - Drapeau américain',
  '🇬🇧': 'UK Flag - Drapeau britannique',
  '🇩🇿': 'Algeria Flag - Drapeau algérien',
  '🇵🇸': 'Palestine Flag - Drapeau palestinien',
  '🇹🇳': 'Tunisia Flag - Drapeau tunisien',
  '🇲🇦': 'Morocco Flag - Drapeau marocain',
  '🇪🇬': 'Egypt Flag - Drapeau égyptien',
  '🇶🇦': 'Qatar Flag - Drapeau qatarien',
  '🇿🇦': 'South Africa Flag - Drapeau sud-africain',
  '🇮🇪': 'Ireland Flag - Drapeau irlandais',
  '🇪🇸': 'Spain Flag - Drapeau espagnol',
  '🇮🇹': 'Italy Flag - Drapeau italien',
  '🏴': 'Black Flag - Drapeau noir',
  '🏳️': 'White Flag - Drapeau blanc',
  '🏁': 'Chequered Flag - Drapeau à damier',
  '🚩': 'Red Flag - Drapeau rouge',
  '🏴‍☠️': 'Pirate Flag - Drapeau pirate',
  
  // Robots
  '🤖': 'Robot - Robot face',
  '👾': 'Alien Monster - Space invader',
  '🛸': 'Flying Saucer - UFO',
  '🦾': 'Mechanical Arm - Robot arm',
  '🦿': 'Mechanical Leg - Robot leg',
  '💡': 'Light Bulb - Idea or light',
  '🔋': 'Battery - Power source',
  '⚙️': 'Gear - Mechanism',
  '🔧': 'Wrench - Tool',
  '🔨': 'Hammer - Building tool',
  '🪛': 'Screwdriver - Precision tool',
  
  // Vehicles
  '🚗': 'Car - Automobile',
  '🚙': 'SUV - Sport utility vehicle',
  '🚕': 'Taxi - Cab',
  '🏎️': 'Racing Car - Fast car',
  '🚓': 'Police Car - Law enforcement',
  '🚑': 'Ambulance - Emergency vehicle',
  '🚒': 'Fire Engine - Fire truck',
  '🚜': 'Tractor - Farm vehicle',
  '🚲': 'Bicycle - Bike',
  '🏍️': 'Motorcycle - Motorbike',
  '✈️': 'Airplane - Aircraft',
  '🚁': 'Helicopter - Chopper',
  '🚂': 'Locomotive - Train engine',
  '🚃': 'Railway Car - Train car',
  
  // Symbols
  '🔴': 'Red Circle - Red',
  '🟠': 'Orange Circle - Orange',
  '🟡': 'Yellow Circle - Yellow',
  '🟢': 'Green Circle - Green',
  '🔵': 'Blue Circle - Blue',
  '🟣': 'Purple Circle - Purple',
  '⚫': 'Black Circle - Black',
  '⚪': 'White Circle - White',
  '🔶': 'Large Orange Diamond',
  '🔷': 'Large Blue Diamond',
  '🔺': 'Red Triangle Pointed Up',
  '🔻': 'Red Triangle Pointed Down',
  '▶️': 'Play Button - Start',
  '◀️': 'Reverse Button - Back',
  '⏸️': 'Pause Button - Pause',
  '⏹️': 'Stop Button - Stop',
  '⏺️': 'Record Button - Record',
  '❗': 'Exclamation Mark - Important',
  '❓': 'Question Mark - Unknown',
  '💯': '100 Points - Perfect score'
};

function ensureEmojiMatrixGrid() {
  if (!dom.emojiMatrix) return;
  
  // Get the selected matrix size
  const matrixSize = parseInt(dom.matrixSize?.value || '8');
  const numCells = matrixSize * matrixSize;
  
  // Only rebuild if size changed
  if (dom.emojiMatrix.childElementCount === numCells) return;

  dom.emojiMatrix.innerHTML = '';
  
  // Set CSS grid columns based on size
  dom.emojiMatrix.style.gridTemplateColumns = `repeat(${matrixSize}, 1fr)`;
  
  for (let i = 0; i < numCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'pixel-cell';
    cell.dataset.index = String(i);
    dom.emojiMatrix.appendChild(cell);
  }
}

function bitsToHex(bits256) {
  const hex = [];
  for (let i = 0; i < 64; i++) {
    const b0 = bits256[i * 4 + 0] ? 1 : 0;
    const b1 = bits256[i * 4 + 1] ? 1 : 0;
    const b2 = bits256[i * 4 + 2] ? 1 : 0;
    const b3 = bits256[i * 4 + 3] ? 1 : 0;
    const value = (b0 << 3) | (b1 << 2) | (b2 << 1) | b3;
    hex.push(value.toString(16));
  }
  return hex.join('');
}

function renderEmojiToBits16(emoji) {
  // Draw big, then sample down.
  const W = 64, H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '56px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji';
  ctx.fillText(emoji, W / 2, H / 2 + 2);

  const img = ctx.getImageData(0, 0, W, H).data;
  const bits = new Array(256).fill(0);

  // Sample each 4x4 block into one pixel
  const cell = 4;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let onScore = 0;
      for (let yy = 0; yy < cell; yy++) {
        for (let xx = 0; xx < cell; xx++) {
          const px = x * cell + xx;
          const py = y * cell + yy;
          const idx = (py * W + px) * 4;
          const r = img[idx + 0];
          const g = img[idx + 1];
          const b = img[idx + 2];
          const a = img[idx + 3];
          // Simple luminance
          const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722);
          // Count pixel as "ink" if it exists and isn't near-black
          if (a > 40 && lum > 18) onScore++;
        }
      }

      // Threshold: at least ~20% of the 16 samples
      bits[y * 16 + x] = onScore >= 3 ? 1 : 0;
    }
  }

  return bits;
}

// NEW: Extract RGB color for each 16x16 pixel
function renderEmojiToRGB(emoji, targetSize = 16) {
  const W = 64, H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '56px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji';
  ctx.fillText(emoji, W / 2, H / 2 + 2);

  const img = ctx.getImageData(0, 0, W, H).data;
  const colors = []; // Array of {r, g, b}

  const cell = Math.floor(64 / targetSize); // 4 for 16×16, 8 for 8×8
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      let totalR = 0, totalG = 0, totalB = 0, totalA = 0;
      let count = 0;

      // Average the cell block
      for (let yy = 0; yy < cell; yy++) {
        for (let xx = 0; xx < cell; xx++) {
          const px = x * cell + xx;
          const py = y * cell + yy;
          const idx = (py * W + px) * 4;
          const r = img[idx + 0];
          const g = img[idx + 1];
          const b = img[idx + 2];
          const a = img[idx + 3];
          
          if (a > 40) { // Only count visible pixels
            totalR += r;
            totalG += g;
            totalB += b;
            totalA += a;
            count++;
          }
        }
      }

      if (count > 2) { // At least 3 pixels in block
        colors.push({
          r: Math.round(totalR / count),
          g: Math.round(totalG / count),
          b: Math.round(totalB / count)
        });
      } else {
        colors.push({ r: 0, g: 0, b: 0 }); // Black/off
      }
    }
  }

  return colors;
}

// Legacy function names for compatibility
function renderEmojiToRGB16(emoji) {
  return renderEmojiToRGB(emoji, 16);
}

function renderEmojiToRGB8(emoji) {
  return renderEmojiToRGB(emoji, 8);
}

// Convert RGB array to hex string for transmission
function rgbToHex(colors) {
  // 256 pixels × 3 bytes = 768 bytes = 1536 hex chars
  const hex = [];
  for (const color of colors) {
    hex.push(color.r.toString(16).padStart(2, '0'));
    hex.push(color.g.toString(16).padStart(2, '0'));
    hex.push(color.b.toString(16).padStart(2, '0'));
  }
  return hex.join('');
}

// Calculate simple checksum: sum of all hex nibbles mod 256
function calculateChecksum(hexData) {
  let sum = 0;
  for (let i = 0; i < hexData.length; i++) {
    const nibble = parseInt(hexData.charAt(i), 16);
    sum = (sum + nibble) % 256;
  }
  return sum.toString(16).padStart(2, '0').toUpperCase();
}

function paintEmojiMatrix(data) {
  if (!dom.emojiMatrix) return;
  ensureEmojiMatrixGrid();
  const cells = dom.emojiMatrix.children;
  
  // Check if data is RGB colors or bits
  if (data[0] && typeof data[0] === 'object' && 'r' in data[0]) {
    // RGB color array
    const max = Math.min(cells.length, data.length);
    for (let i = 0; i < max; i++) {
      const color = data[i];
      const isOn = color.r > 10 || color.g > 10 || color.b > 10;
      cells[i].classList.toggle('on', isOn);
      if (isOn) {
        cells[i].style.background = `rgb(${color.r}, ${color.g}, ${color.b})`;
        cells[i].style.boxShadow = `0 0 8px rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`;
      } else {
        cells[i].style.background = '';
        cells[i].style.boxShadow = '';
      }
    }
  } else {
    // Monochrome bits (legacy)
    const max = Math.min(cells.length, data.length);
    for (let i = 0; i < max; i++) {
      cells[i].classList.toggle('on', !!data[i]);
      cells[i].style.background = '';
      cells[i].style.boxShadow = '';
    }
  }
}

function buildEmojiPicker() {
  if (!dom.emojiList) return;

  dom.emojiList.innerHTML = '';
  dom.emojiList.classList.remove('emoji-grid');
  dom.emojiList.classList.add('emoji-categories');

  for (const [categoryName, emojis] of Object.entries(EMOJI_LIBRARY)) {
    // Create category section
    const categorySection = document.createElement('details');
    categorySection.className = 'emoji-category';
    categorySection.open = categoryName === '😀 Basic'; // First category open by default

    // Category header
    const summary = document.createElement('summary');
    summary.className = 'emoji-category-title';
    summary.textContent = categoryName;
    categorySection.appendChild(summary);

    // Emoji grid for this category
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    
    for (const emoji of emojis) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-btn';
      btn.textContent = emoji;
      btn.setAttribute('data-description', EMOJI_DESCRIPTIONS[emoji] || 'Custom emoji');
      btn.addEventListener('click', () => selectEmoji(emoji, btn));
      grid.appendChild(btn);
    }

    categorySection.appendChild(grid);
    dom.emojiList.appendChild(categorySection);
  }

  ensureEmojiMatrixGrid();
  initEditablePreview();
}

function selectEmoji(emoji, btnEl) {
  selectedEmoji = emoji;

  // Toggle active state - find all emoji buttons in all categories
  if (dom.emojiList) {
    const allButtons = dom.emojiList.querySelectorAll('.emoji-btn');
    allButtons.forEach(btn => btn.classList.remove('active'));
  }
  if (btnEl) btnEl.classList.add('active');

  // Extract RGB color data based on selected matrix size
  const matrixSize = parseInt(dom.matrixSize?.value || '8');
  const colors = renderEmojiToRGB(emoji, matrixSize);
  setPreviewFromColors(colors, emoji);

  if (dom.sendEmojiBtn) dom.sendEmojiBtn.disabled = !isConnected;
}

async function sendEmoji() {
  if (!selectedEmojiHex) {
    log('Pick an emoji first', 'error');
    return;
  }
  if (!isConnected) {
    log('Not connected', 'error');
    return;
  }
  if (sendInProgress) return;

  showLoadingIndicator('Sending emoji...');
  
  try {
    // Add checksum: RGBMOJI:hexdata|CS
    const checksum = calculateChecksum(selectedEmojiHex);
    const payload = `RGBMOJI:${selectedEmojiHex}|${checksum}`;
    const byteLen = encoder.encode(payload).length;

    log(`Sending colorized emoji (${byteLen} bytes)`, 'info');

    // Always use chunked transfer for RGB (too large for single packet)
    await sendChunked(payload);
  } finally {
    hideLoadingIndicator();
  }
}

// Send current preview colors to micro:bit (for demos)
let demoSendInProgress = false;
let statusOkResolver = null;

async function sendCurrentFrame() {
  if (!isConnected || demoSendInProgress) return;
  
  demoSendInProgress = true;
  
  try {
    // Convert current preview colors to hex
    const hexData = rgbToHex(previewColors);
    const checksum = calculateChecksum(hexData);
    const payload = `RGBMOJI:${hexData}|${checksum}`;
    
    // Create a promise that resolves when we receive STATUS:OK
    const statusPromise = new Promise((resolve) => {
      statusOkResolver = resolve;
      // Timeout after 2 seconds in case STATUS never arrives
      setTimeout(() => {
        if (statusOkResolver === resolve) {
          statusOkResolver = null;
          resolve(false);
        }
      }, 2000);
    });
    
    // Send the frame
    await sendChunked(payload);
    
    // Wait for micro:bit to confirm it finished displaying
    await statusPromise;
  } catch (err) {
    console.error('Demo frame send error:', err);
  } finally {
    demoSendInProgress = false;
  }
}

function log(msg, type = 'info') {
  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  div.textContent = `${timestamp()} ${msg}`;
  dom.logContainer.appendChild(div);
  dom.logContainer.scrollTop = dom.logContainer.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════════
//  📡 DISCRETE LOADING INDICATOR
// ═══════════════════════════════════════════════════════════════════

const loadingMessages = [
  'Sending to micro:bit...',
  'Transferring data...',
  'Streaming pixels...',
  'Uploading emoji...',
  'Beaming to device...',
];

function showLoadingIndicator(message) {
  const indicator = document.getElementById('loadingIndicator');
  const messageEl = document.getElementById('loadingMessage');
  
  if (indicator && messageEl) {
    messageEl.textContent = message || loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
    indicator.style.display = 'block';
    indicator.style.animation = 'slideIn 0.3s ease-out';
  }
}

function hideLoadingIndicator() {
  const indicator = document.getElementById('loadingIndicator');
  if (indicator) {
    indicator.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      indicator.style.display = 'none';
    }, 300);
  }
}

function clearLog() {
  dom.logContainer.innerHTML = '';
  log('Log cleared');
}

function clearStats() {
  cumulative.tests = 0;
  cumulative.bytes = 0;
  cumulative.chunks = 0;
  cumulative.retries = 0;
  cumulative.time = 0;
  cumulative.minSpeed = Infinity;
  cumulative.maxSpeed = 0;
  cumulative.minRetries = Infinity;
  cumulative.maxRetries = 0;
  cumulative.maxRetryPerChunk = 0;
  log('Stats cleared', 'success');
}

function getLogText() {
  return Array.from(dom.logContainer.children).map(d => d.textContent).join('\n');
}

async function copyLog() {
  await navigator.clipboard.writeText(getLogText());
  log('Logs copied to clipboard', 'success');
}

function exportLog() {
  const blob = new Blob([getLogText()], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'microbit-log.txt';
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════════════════════════
function setConnected(connected) {
  isConnected = connected;
  dom.statusText.textContent = connected ? 'Connected' : 'Disconnected';
  dom.statusDot.classList.toggle('connected', connected);
  dom.statusPill.classList.toggle('connected', connected);
  dom.connectBtn.disabled = connected;
  dom.disconnectBtn.disabled = !connected;
  dom.sendBtn.disabled = !connected;
  if (dom.sendEmojiBtn) dom.sendEmojiBtn.disabled = !connected;
  if (dom.testBtn) dom.testBtn.disabled = !connected;
}

// ═══════════════════════════════════════════════════════════════════
// SERIAL CONNECTION
// ═══════════════════════════════════════════════════════════════════
async function connect() {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: CONFIG.baudRate });
  writer = port.writable.getWriter();
  readLoop();
  rxBuffer = '';
  setConnected(true);
  log('Connected', 'success');
  
  // Reset micro:bit state first (clears any leftover buffer data)
  await delay(100); // Small delay to let connection stabilize
  await sendRaw('CLEAR');
  await delay(50);
  
  // Send initial MODE command based on selected matrix size
  const matrixSize = parseInt(dom.matrixSize?.value || '8');
  await sendMode(matrixSize);
  
  // Sync brightness with micro:bit (10% default - safe for NeoPixels)
  const brightness = parseInt(dom.brightnessSlider?.value || '10');
  await sendBrightness(brightness);
}

async function disconnect() {
  isConnected = false;
  if (writer) { await writer.close().catch(() => {}); writer = null; }
  if (reader) { await reader.cancel().catch(() => {}); reader = null; }
  if (port) { await port.close().catch(() => {}); port = null; }
  setConnected(false);
  abortAck('Disconnected');
  log('Disconnected', 'error');
}

async function readLoop() {
  while (port && port.readable) {
    reader = port.readable.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) processRxData(value);
      }
    } catch (error) {
      if (isConnected) log('Read error: ' + error.message, 'error');
    } finally {
      reader.releaseLock();
      reader = null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// RX PROCESSING
// ═══════════════════════════════════════════════════════════════════
function processRxData(data) {
  rxBuffer += decoder.decode(data).replace(/\r/g, '');

  let nl;
  while ((nl = rxBuffer.indexOf('\n')) !== -1) {
    const line = rxBuffer.slice(0, nl).trim();
    rxBuffer = rxBuffer.slice(nl + 1);
    if (!line) continue;

    log('← ' + line, 'rx');

    if (line.startsWith('>')) {
      tryResolveAck(line.slice(1));
    } else if (line.startsWith('STATUS:')) {
      handleStatusMessage(line.slice(7));
    }
  }
}

// Handle checksum status from micro:bit
function handleStatusMessage(status) {
  const parts = status.split('|');
  const result = parts[0];
  const mbChecksum = parts[1];
  const sentChecksum = parts[2];
  
  if (result === 'OK') {
    showStatusBadge(`✓ 0x${mbChecksum}`, '#10b981', 2000);
    log(`✓ Checksum OK: 0x${mbChecksum}`, 'success');
    // Resolve the demo frame promise so next frame can be sent
    if (statusOkResolver) {
      const resolver = statusOkResolver;
      statusOkResolver = null;
      resolver(true);
    }
  } else if (result === 'BAD') {
    showStatusBadge(`✗ 0x${mbChecksum}≠0x${sentChecksum}`, '#ef4444', 4000);
    log(`✗ Checksum FAILED! Calculated: 0x${mbChecksum}, Expected: 0x${sentChecksum}`, 'error');
    // Also resolve on failure so demo doesn't hang
    if (statusOkResolver) {
      const resolver = statusOkResolver;
      statusOkResolver = null;
      resolver(false);
    }
  }
}

// Show temporary status badge
function showStatusBadge(icon, color, duration) {
  const badge = document.createElement('div');
  badge.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${color};
    color: white;
    padding: 10px 16px;
    border-radius: 50px;
    font-size: 1.2rem;
    font-weight: bold;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  badge.textContent = icon;
  document.body.appendChild(badge);
  
  setTimeout(() => {
    badge.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => badge.remove(), 300);
  }, duration);
}

// ═══════════════════════════════════════════════════════════════════
// TX / ACK
// ═══════════════════════════════════════════════════════════════════
async function sendRaw(msg) {
  await writer.write(encoder.encode(msg + '\n'));
  log('→ ' + msg, 'tx');
}

function abortAck(reason) {
  if (awaitingTimer) clearTimeout(awaitingTimer);
  if (awaitingReject) awaitingReject(new Error(reason));
  awaitingPayload = awaitingResolve = awaitingReject = null;
}

function waitForAck(payload) {
  return new Promise((resolve, reject) => {
    awaitingPayload = payload;
    awaitingResolve = resolve;
    awaitingReject = reject;
    awaitingTimer = setTimeout(() => {
      abortAck('ACK timeout');
      reject(new Error('ACK timeout'));
    }, CONFIG.ackTimeout);
  });
}

function tryResolveAck(echoed) {
  if (!awaitingResolve || !awaitingPayload) return;
  
  // For chunked data: "seq|payload" - accept just the sequence number
  const barIdx = awaitingPayload.indexOf('|');
  if (barIdx > 0) {
    const expectedSeq = awaitingPayload.substring(0, barIdx);
    
    // Accept sequence-only ACK (lightweight protocol - prevents buffer overflow)
    if (echoed === expectedSeq) {
      clearTimeout(awaitingTimer);
      const resolve = awaitingResolve;
      awaitingPayload = awaitingResolve = awaitingReject = null;
      resolve(true);
      return;
    }
    
    // Also accept full payload echo (backward compatibility)
    if (echoed === awaitingPayload) {
      clearTimeout(awaitingTimer);
      const resolve = awaitingResolve;
      awaitingPayload = awaitingResolve = awaitingReject = null;
      resolve(true);
      return;
    }
  }
  
  // Exact match for non-chunked commands
  if (echoed === awaitingPayload) {
    clearTimeout(awaitingTimer);
    const resolve = awaitingResolve;
    awaitingPayload = awaitingResolve = awaitingReject = null;
    resolve(true);
    return;
  }
  
  // Match for non-chunked commands (MODE, BRIGHTNESS, etc)
  if (echoed === 'OK') {
    clearTimeout(awaitingTimer);
    const resolve = awaitingResolve;
    awaitingPayload = awaitingResolve = awaitingReject = null;
    resolve(true);
  }
}

// ═══════════════════════════════════════════════════════════════════
// CHUNKED TRANSFER
// ═══════════════════════════════════════════════════════════════════
function maxDataLenForSeq(seq) {
  const seqLen = String(seq).length;
  return Math.max(1, CONFIG.chunkSize - 1 - seqLen - 1);
}

async function sendChunked(msg) {
  sendInProgress = true;
  stats.retries = 0;
  stats.chunks = 0;
  stats.maxRetryPerChunk = 0;

  try {
    let seq = 0;
    let i = 0;

    while (i < msg.length) {
      const dataLen = maxDataLenForSeq(seq);
      const payload = `${seq}|${msg.slice(i, i + dataLen)}`;

      let success = false;
      let chunkRetries = 0;
      for (let retry = 0; retry < CONFIG.maxRetries && !success; retry++) {
        if (retry > 0) {
          chunkRetries++;
          stats.retries++;
          log(`Retry ${retry} for chunk ${seq}`, 'error');
          rxBuffer = '';
          await delay(CONFIG.retryDelay);
        }
        await sendRaw(payload);
        try {
          await waitForAck(payload);
          success = true;
          stats.maxRetryPerChunk = Math.max(stats.maxRetryPerChunk, chunkRetries);
        } catch (e) {
          if (retry === CONFIG.maxRetries - 1) throw e;
        }
      }

      i += dataLen;
      seq = (seq + 1) % (CONFIG.maxSeq + 1);
      stats.chunks++;
    }
  } finally {
    // Always reset sendInProgress, even if there was an error
    sendInProgress = false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SEND MESSAGE
// ═══════════════════════════════════════════════════════════════════
async function sendMessage() {
  const msg = dom.messageInput.value;
  if (!msg) return;

  const byteLen = encoder.encode(msg).length;

  if (byteLen < CONFIG.chunkSize) {
    await sendRaw(msg);
  } else {
    if (/\s/.test(msg)) {
      log('Long messages must contain NO SPACES', 'error');
      return;
    }
    if (sendInProgress) return;
    await sendChunked(msg);
  }

  dom.messageInput.value = '';
}

// ═══════════════════════════════════════════════════════════════════
// TEST
// ═══════════════════════════════════════════════════════════════════
function makeTestString() {
  let s = '';
  for (let i = 0; i <= 1000; i++) s += i;
  return s;
}

async function runTest() {
  const testData = makeTestString();
  log(`TEST #${cumulative.tests + 1} start (${testData.length} chars)`, 'info');

  const t0 = performance.now();
  await sendChunked(testData);
  const elapsed = (performance.now() - t0) / 1000;

  // Calculate stats
  const speed = testData.length / elapsed;
  const attempts = stats.chunks + stats.retries;
  const successRate = ((stats.chunks / attempts) * 100).toFixed(1);

  // Update cumulative
  cumulative.tests++;
  cumulative.bytes += testData.length;
  cumulative.chunks += stats.chunks;
  cumulative.retries += stats.retries;
  cumulative.time += elapsed;
  cumulative.minSpeed = Math.min(cumulative.minSpeed, speed);
  cumulative.maxSpeed = Math.max(cumulative.maxSpeed, speed);
  cumulative.minRetries = Math.min(cumulative.minRetries, stats.retries);
  cumulative.maxRetries = Math.max(cumulative.maxRetries, stats.retries);
  cumulative.maxRetryPerChunk = Math.max(cumulative.maxRetryPerChunk, stats.maxRetryPerChunk);

  // Calculate cumulative stats
  const cumAttempts = cumulative.chunks + cumulative.retries;
  const cumSuccessRate = ((cumulative.chunks / cumAttempts) * 100).toFixed(1);
  const avgSpeed = cumulative.bytes / cumulative.time;
  const avgRetries = cumulative.retries / cumulative.tests;

  // Display results
  log(`════════════════════════════════════════`, 'info');
  log(`TEST #${cumulative.tests} COMPLETE`, 'success');
  log(`────────────────────────────────────────`, 'info');
  log(`  Chunks: ${stats.chunks} | Retries: ${stats.retries} | Max retry: ${stats.maxRetryPerChunk} | Success: ${successRate}%`, 'info');
  log(`  Time: ${elapsed.toFixed(2)}s | Speed: ${speed.toFixed(1)} B/s`, 'info');
  log(`════════════════════════════════════════`, 'info');
  log(`CUMULATIVE STATS (${cumulative.tests} tests)`, 'success');
  log(`────────────────────────────────────────`, 'info');
  log(`  Total: ${cumulative.bytes} bytes | ${cumulative.chunks} chunks | ${cumulative.retries} retries`, 'info');
  log(`  Success rate: ${cumSuccessRate}%`, 'info');
  log(`  Speed: min=${cumulative.minSpeed.toFixed(0)} avg=${avgSpeed.toFixed(0)} max=${cumulative.maxSpeed.toFixed(0)} B/s`, 'info');
  log(`  Retries/test: min=${cumulative.minRetries} avg=${avgRetries.toFixed(1)} max=${cumulative.maxRetries}`, 'info');
  log(`  Max retries for single chunk: ${cumulative.maxRetryPerChunk}`, 'info');
  log(`  Total time: ${cumulative.time.toFixed(2)}s`, 'info');
  log(`════════════════════════════════════════`, 'info');
}

// ═══════════════════════════════════════════════════════════════════
// EVENT LISTENERS (init after DOM is ready)
// ═══════════════════════════════════════════════════════════════════

function initUI() {
  // Core buttons
  if (dom.connectBtn) dom.connectBtn.onclick = connect;
  if (dom.disconnectBtn) dom.disconnectBtn.onclick = disconnect;
  if (dom.sendBtn) dom.sendBtn.onclick = sendMessage;
  if (dom.messageInput) dom.messageInput.onkeypress = e => { if (e.key === 'Enter') sendMessage(); };
  if (dom.testBtn) dom.testBtn.onclick = runTest;
  if (dom.clearStatsBtn) dom.clearStatsBtn.onclick = clearStats;
  if (dom.clearLogBtn) dom.clearLogBtn.onclick = clearLog;
  if (dom.copyLogBtn) dom.copyLogBtn.onclick = copyLog;
  if (dom.exportLogBtn) dom.exportLogBtn.onclick = exportLog;

  // Build emoji picker + preview grid
  buildEmojiPicker();
  ensureEmojiMatrixGrid();
  initEditablePreview();

  // Emoji send
  if (dom.sendEmojiBtn) dom.sendEmojiBtn.onclick = sendEmoji;

  // Preview controls
  if (dom.clearPreviewBtn) dom.clearPreviewBtn.onclick = clearPreview;
  if (dom.testRedBtn) dom.testRedBtn.onclick = () => fillPreview(255, 0, 0);
  if (dom.testGreenBtn) dom.testGreenBtn.onclick = () => fillPreview(0, 255, 0);
  if (dom.testBlueBtn) dom.testBlueBtn.onclick = () => fillPreview(0, 0, 255);
  if (dom.testWhiteBtn) dom.testWhiteBtn.onclick = () => fillPreview(255, 255, 255);
}

// Make preview editable (click/drag paint + toggle)
let currentBrushColor = { r: 255, g: 0, b: 0 }; // Default red
let previewColors = []; // per-pixel RGB
let previewIsPainting = false;
let previewDragMode = 'paint'; // 'paint' | 'erase'
let previewLastIndex = -1;

function getMatrixSize() {
  return parseInt(dom.matrixSize?.value || '8');
}

function ensurePreviewColorsSize() {
  const size = getMatrixSize();
  const n = size * size;
  if (!Array.isArray(previewColors) || previewColors.length !== n) {
    previewColors = Array.from({ length: n }, () => ({ r: 0, g: 0, b: 0 }));
  }
}

// Check if preview has any non-black pixels
function hasPreviewContent() {
  return previewColors.some(c => c.r > 0 || c.g > 0 || c.b > 0);
}

function setPreviewFromColors(colors, label = null) {
  previewColors = colors.map(c => ({ r: c.r|0, g: c.g|0, b: c.b|0 }));
  paintEmojiMatrix(previewColors);
  selectedEmojiHex = rgbToHex(previewColors);
  if (label && dom.selectedEmojiText) dom.selectedEmojiText.textContent = label;
}

function updateHexFromPreview() {
  selectedEmojiHex = rgbToHex(previewColors);
}

function isPixelOn(color) {
  return (color.r|0) > 10 || (color.g|0) > 10 || (color.b|0) > 10;
}

function setPixel(index, color) {
  if (index < 0 || index >= previewColors.length) return;
  previewColors[index] = { r: color.r|0, g: color.g|0, b: color.b|0 };

  // Update just that cell for snappy painting
  const cell = dom.emojiMatrix?.children?.[index];
  if (!cell) return;
  const on = isPixelOn(previewColors[index]);
  cell.classList.toggle('on', on);
  if (on) {
    cell.style.background = `rgb(${previewColors[index].r}, ${previewColors[index].g}, ${previewColors[index].b})`;
    cell.style.boxShadow = `0 0 8px rgba(${previewColors[index].r}, ${previewColors[index].g}, ${previewColors[index].b}, 0.8)`;
    
    // 🎨 FUN BOUNCY ANIMATION FOR KIDS!
    cell.classList.add('just-painted');
    cell.classList.add('painted-active');
    
    // Remove animation classes after animation completes
    setTimeout(() => {
      cell.classList.remove('just-painted');
    }, 500);
    setTimeout(() => {
      cell.classList.remove('painted-active');
    }, 800);
  } else {
    cell.style.background = '';
    cell.style.boxShadow = '';
  }
}

function getCellIndexAtPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return -1;
  const cell = el.closest?.('.pixel-cell');
  if (!cell || !dom.emojiMatrix?.contains(cell)) return -1;
  const idx = parseInt(cell.dataset.index || '-1', 10);
  return Number.isFinite(idx) ? idx : -1;
}

function applyToggle(index) {
  const current = previewColors[index] || { r: 0, g: 0, b: 0 };
  if (isPixelOn(current)) {
    setPixel(index, { r: 0, g: 0, b: 0 });
  } else {
    setPixel(index, currentBrushColor);
  }
  updateHexFromPreview();
  selectedEmoji = null;
  if (dom.selectedEmojiText) dom.selectedEmojiText.textContent = 'Custom';
  if (dom.selectedEmojiDescription) dom.selectedEmojiDescription.textContent = 'Your custom creation';
}

function initEditablePreview() {
  if (!dom.emojiMatrix) return;
  if (dom.emojiMatrix.dataset.editableInit === "1") return;
  dom.emojiMatrix.dataset.editableInit = "1";


  // Brush color picker
  if (dom.brushColor) {
    const setFromHex = (hex) => {
      const h = (hex || '').replace('#','');
      if (h.length === 6) {
        currentBrushColor = {
          r: parseInt(h.slice(0,2),16) || 0,
          g: parseInt(h.slice(2,4),16) || 0,
          b: parseInt(h.slice(4,6),16) || 0,
        };
      }
    };
    setFromHex(dom.brushColor.value);
    dom.brushColor.addEventListener('input', (e) => setFromHex(e.target.value));
    
    // Add fun color button functionality
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const color = btn.getAttribute('data-color');
        dom.brushColor.value = color;
        setFromHex(color);
        // Fun animation feedback
        btn.style.transform = 'scale(1.3) rotate(15deg)';
        setTimeout(() => {
          btn.style.transform = '';
        }, 200);
      });
    });
  }

  dom.emojiMatrix.addEventListener('contextmenu', (e) => e.preventDefault());

  dom.emojiMatrix.addEventListener('pointerdown', (e) => {
    ensureEmojiMatrixGrid();
    ensurePreviewColorsSize();

    const idx = getCellIndexAtPoint(e.clientX, e.clientY);
    if (idx < 0) return;

    const erase = e.shiftKey || e.altKey || e.button === 2;
    previewDragMode = erase ? 'erase' : 'paint';
    previewIsPainting = true;
    previewLastIndex = -1;

    // Click toggles (only for paint mode). Erase always erases.
    if (previewDragMode === 'erase') {
      setPixel(idx, { r: 0, g: 0, b: 0 });
      updateHexFromPreview();
    } else {
      applyToggle(idx);
    }

    dom.emojiMatrix.setPointerCapture?.(e.pointerId);
  });

  dom.emojiMatrix.addEventListener('pointermove', (e) => {
    if (!previewIsPainting) return;
    const idx = getCellIndexAtPoint(e.clientX, e.clientY);
    if (idx < 0 || idx === previewLastIndex) return;
    previewLastIndex = idx;

    if (previewDragMode === 'erase') {
      setPixel(idx, { r: 0, g: 0, b: 0 });
    } else {
      // Drag paints (no toggle during drag)
      setPixel(idx, currentBrushColor);
    }

    updateHexFromPreview();
    selectedEmoji = null;
    if (dom.selectedEmojiText) dom.selectedEmojiText.textContent = 'Custom';
    if (dom.selectedEmojiDescription) dom.selectedEmojiDescription.textContent = 'Your custom creation';
  });

  const stop = () => {
    previewIsPainting = false;
    previewLastIndex = -1;
  };
  dom.emojiMatrix.addEventListener('pointerup', stop);
  dom.emojiMatrix.addEventListener('pointercancel', stop);
  dom.emojiMatrix.addEventListener('pointerleave', stop);
}

function clearPreview() {
  const size = getMatrixSize();
  const n = size * size;
  const colors = Array.from({ length: n }, () => ({ r: 0, g: 0, b: 0 }));
  setPreviewFromColors(colors, 'Custom');
  selectedEmoji = null;
  log('Preview cleared', 'info');
}

function fillPreview(r, g, b) {
  const size = getMatrixSize();
  const n = size * size;
  const colors = Array.from({ length: n }, () => ({ r: r|0, g: g|0, b: b|0 }));
  setPreviewFromColors(colors, 'Test Pattern');
  selectedEmoji = null;
  log(`Test pattern: RGB(${r},${g},${b})`, 'info');
}

// Matrix size selector
if (dom.matrixSize) {
  dom.matrixSize.onchange = async function() {
    const matrixSize = parseInt(this.value);
    
    // Send MODE command to micro:bit
    if (isConnected) {
      await sendMode(matrixSize);
    }
    
    // Rebuild the preview grid with new size
    ensureEmojiMatrixGrid();
    
    // Re-render the currently selected emoji with new size
    if (selectedEmoji) {
      const colors = renderEmojiToRGB(selectedEmoji, matrixSize);
      setPreviewFromColors(colors);
      log(`Matrix size changed to ${matrixSize}×${matrixSize}`, 'info');
    }
  };
}

async function sendMode(size) {
  if (!isConnected) {
    log('Not connected', 'error');
    return;
  }
  
  const payload = `MODE:${size}`;
  log(`Setting matrix mode to ${size}×${size}`, 'info');
  await sendRaw(payload);
  await waitForAck(payload);
}

// Brightness control
if (dom.brightnessSlider && dom.brightnessValue) {
  console.log('Brightness control initialized');
  
  // Set safer max (100 is already very bright for NeoPixels!)
  dom.brightnessSlider.max = '100';
  dom.brightnessSlider.min = '10';
  if (parseInt(dom.brightnessSlider.value) > 100) {
    dom.brightnessSlider.value = '10'; // Safe default
  }
  
  dom.brightnessSlider.oninput = function() {
    console.log('Brightness slider moved:', this.value);
    const percent = Math.round((this.value / 100) * 100);
    dom.brightnessValue.textContent = percent;
  };
  
  dom.brightnessSlider.onchange = async function() {
    console.log('Brightness slider released:', this.value, 'Connected:', isConnected);
    if (isConnected) {
      const brightness = parseInt(this.value);
      await sendBrightness(brightness);
    } else {
      log('Connect to micro:bit first', 'warning');
    }
  };
} else {
  console.error('Brightness slider not found!', {
    slider: dom.brightnessSlider,
    value: dom.brightnessValue
  });
}

async function sendBrightness(brightness) {
  if (!isConnected) {
    log('Not connected', 'error');
    return;
  }
  
  // Cap brightness for safety (100 is already very bright!)
  brightness = Math.max(10, Math.min(100, brightness));
  
  const payload = `BRIGHTNESS:${brightness}`;
  log(`Setting brightness to ${brightness}%`, 'info');
  await sendRaw(payload);
  
  // Wait for ACK with timeout, but don't fail if it times out
  try {
    await waitForAck(payload);
  } catch (e) {
    // Brightness command might not always get ACK'd cleanly
    console.log('Brightness ACK timeout (non-critical)');
  }
  
  // Longer delay to let NeoPixels settle before next command
  await delay(100);
}

// ═══════════════════════════════════════════════════════════════════
// SIMPLE MODE TOGGLE
// ═══════════════════════════════════════════════════════════════════
if (dom.simpleModeToggle) {
  dom.simpleModeToggle.onchange = function() {
    if (this.checked) {
      dom.emojiMatrix.classList.add('simple-mode');
    } else {
      dom.emojiMatrix.classList.remove('simple-mode');
    }
  };
}

// ═══════════════════════════════════════════════════════════════════
//  💾 SAVE / LOAD DESIGNS
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'bitmoji-saved-designs';

function getSavedDesigns() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error loading saved designs:', e);
    return [];
  }
}

function saveDesign(name, colors) {
  try {
    const designs = getSavedDesigns();
    const newDesign = {
      id: Date.now(),
      name: name || `Design ${designs.length + 1}`,
      colors: colors,
      timestamp: new Date().toISOString()
    };
    designs.push(newDesign);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
    return true;
  } catch (e) {
    console.error('Error saving design:', e);
    return false;
  }
}

function deleteDesign(id) {
  try {
    const designs = getSavedDesigns();
    const filtered = designs.filter(d => d.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (e) {
    console.error('Error deleting design:', e);
    return false;
  }
}

function loadDesignIntoPreview(colors) {
  ensureEmojiMatrixGrid(); // Make sure the grid exists
  ensurePreviewColorsSize();
  // Use setPreviewFromColors to properly update the visual display
  setPreviewFromColors(colors);
  updateHexFromPreview();
}

function renderSavedDesigns() {
  const designs = getSavedDesigns();
  
  if (designs.length === 0) {
    dom.savedDesignsList.style.display = 'none';
    dom.noSavedDesigns.style.display = 'block';
    return;
  }
  
  dom.savedDesignsList.style.display = 'grid';
  dom.noSavedDesigns.style.display = 'none';
  dom.savedDesignsList.innerHTML = '';
  
  designs.reverse().forEach(design => {
    const card = document.createElement('div');
    card.style.cssText = `
      background: linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,41,59,0.9));
      border: 1px solid rgba(148,163,184,0.3);
      border-radius: 12px;
      padding: 8px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    
    // Mini preview canvas
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    canvas.style.cssText = `
      width: 100%;
      height: auto;
      border-radius: 6px;
      margin-bottom: 6px;
      image-rendering: pixelated;
      border: 1px solid rgba(148,163,184,0.2);
    `;
    const ctx = canvas.getContext('2d');
    
    // Draw mini preview
    for (let i = 0; i < 256; i++) {
      const x = i % 16;
      const y = Math.floor(i / 16);
      const color = design.colors[i] || { r: 0, g: 0, b: 0 };
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      ctx.fillRect(x, y, 1, 1);
    }
    
    // Name
    const nameDiv = document.createElement('div');
    nameDiv.textContent = design.name;
    nameDiv.style.cssText = `
      font-size: 0.7rem;
      color: #e5e7eb;
      text-align: center;
      margin-bottom: 6px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    
    // Buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.style.cssText = 'display: flex; gap: 4px;';
    
    const loadBtn = document.createElement('button');
    loadBtn.textContent = '📥 Load';
    loadBtn.className = 'secondary small';
    loadBtn.style.cssText = 'flex: 1; font-size: 0.65rem; padding: 4px 6px;';
    loadBtn.onclick = (e) => {
      e.stopPropagation();
      loadDesignIntoPreview(design.colors);
      log(`✨ Loaded: ${design.name}`, 'success');
      
      // Visual feedback animation
      card.style.transform = 'scale(1.1)';
      card.style.boxShadow = '0 0 30px rgba(34,197,94,0.8)';
      setTimeout(() => {
        card.style.transform = '';
        card.style.boxShadow = '';
      }, 300);
    };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.className = 'secondary small';
    deleteBtn.style.cssText = 'font-size: 0.65rem; padding: 4px 8px; background: rgba(239,68,68,0.2);';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${design.name}"?`)) {
        deleteDesign(design.id);
        renderSavedDesigns();
        log(`Deleted: ${design.name}`, 'info');
      }
    };
    
    buttonsDiv.appendChild(loadBtn);
    buttonsDiv.appendChild(deleteBtn);
    
    card.appendChild(canvas);
    card.appendChild(nameDiv);
    card.appendChild(buttonsDiv);
    
    // Hover effects
    card.onmouseenter = () => {
      card.style.transform = 'translateY(-2px) scale(1.02)';
      card.style.boxShadow = '0 0 20px rgba(34,197,94,0.4)';
    };
    card.onmouseleave = () => {
      card.style.transform = '';
      card.style.boxShadow = '';
    };
    
    // Click to load
    card.onclick = () => {
      loadDesignIntoPreview(design.colors);
      log(`✨ Loaded: ${design.name}`, 'success');
      
      // Visual feedback animation
      card.style.transform = 'scale(1.1)';
      card.style.boxShadow = '0 0 30px rgba(34,197,94,0.8)';
      setTimeout(() => {
        card.style.transform = '';
        card.style.boxShadow = '';
      }, 300);
    };
    
    dom.savedDesignsList.appendChild(card);
  });
}

// Save button handler
if (dom.saveDesignBtn) {
  dom.saveDesignBtn.addEventListener('click', () => {
    const name = dom.saveNameInput.value.trim() || `Design ${Date.now()}`;
    ensurePreviewColorsSize();
    
    if (saveDesign(name, previewColors)) {
      log(`✨ Saved: ${name}`, 'success');
      dom.saveNameInput.value = '';
      renderSavedDesigns();
      
      // Fun animation
      dom.saveDesignBtn.style.transform = 'scale(1.2) rotate(360deg)';
      setTimeout(() => {
        dom.saveDesignBtn.style.transform = '';
      }, 300);
    } else {
      log('Failed to save design', 'error');
    }
  });
}

// Load saved designs on startup
renderSavedDesigns();

// ═══════════════════════════════════════════════════════════════════
//  🎬 DEMO ANIMATIONS
// ═══════════════════════════════════════════════════════════════════

let demoRunning = false;
let demoStopRequested = false;

function stopDemoAnimation() {
  demoStopRequested = true;
  demoRunning = false;
  hideLoadingIndicator();
}

async function startDemo(demoFunction) {
  stopDemoAnimation();
  
  // Wait a moment for any previous demo to fully stop
  await delay(50);
  
  ensureEmojiMatrixGrid();
  ensurePreviewColorsSize();
  
  demoStopRequested = false;
  demoRunning = true;
  
  // Show brief indicator when starting demo
  if (isConnected) {
    showLoadingIndicator('Starting demo...');
    setTimeout(() => hideLoadingIndicator(), 1500);
  }
  
  // Log connection status
  if (isConnected) {
    log('🎬 Demo streaming to micro:bit! 📡', 'success');
  } else {
    log('🎬 Demo started (connect micro:bit to stream live!)', 'info');
  }
  
  // Run the demo (it's now an async loop)
  demoFunction();
}

// Helper: run demo loop with proper frame timing
async function runDemoLoop(frameInterval, renderFrame) {
  while (demoRunning && !demoStopRequested) {
    const frameStart = performance.now();
    
    // Render the frame to preview
    renderFrame();
    paintEmojiMatrix(previewColors);
    
    // Send to micro:bit and wait for completion
    if (isConnected) {
      await sendCurrentFrame();
    }
    
    // Check if demo was stopped during send
    if (demoStopRequested) break;
    
    // Wait for remaining frame time
    const elapsed = performance.now() - frameStart;
    const remaining = frameInterval - elapsed;
    if (remaining > 0) {
      await delay(remaining);
    }
  }
  
  demoRunning = false;
}

// 🏴 Waving Flag Animation
function demoWavingFlagAnim() {
  let frame = 0;
  const colors = [
    { r: 0, g: 85, b: 164 },    // Blue
    { r: 255, g: 255, b: 255 }, // White
    { r: 239, g: 65, b: 53 }    // Red
  ];
  
  runDemoLoop(100, () => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const idx = y * 16 + x;
        // Wave effect
        const wave = Math.sin((x + frame) * 0.5) * 2;
        const colorIdx = Math.floor((y + wave) / 5.33) % 3;
        previewColors[idx] = { ...colors[colorIdx] };
      }
    }
    frame++;
  });
}

// 🚦 Traffic Light Animation
function demoTrafficLightAnim() {
  const states = [
    { color: { r: 255, g: 0, b: 0 }, name: 'RED - STOP' },
    { color: { r: 255, g: 200, b: 0 }, name: 'YELLOW - CAUTION' },
    { color: { r: 0, g: 255, b: 0 }, name: 'GREEN - GO' }
  ];
  let stateIdx = 0;
  
  runDemoLoop(1500, () => {
    const state = states[stateIdx];
    
    // Fill entire grid with current light color
    for (let i = 0; i < 256; i++) {
      previewColors[i] = { ...state.color };
    }
    
    log(`🚦 ${state.name}`, 'info');
    stateIdx = (stateIdx + 1) % 3;
  });
}

// 💓 Heart Beat Animation
function demoHeartBeatAnim() {
  let beat = 0;
  
  // Heart shape pattern (simplified 16x16)
  const heartPattern = [
    0,0,0,0,1,1,1,0,0,1,1,1,0,0,0,0,
    0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,
    0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,
    0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
    0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
    0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,
    0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,
    0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,
    0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
    0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,
    0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
  ];
  
  runDemoLoop(100, () => {
    const scale = 0.8 + Math.sin(beat) * 0.2; // Pulsating scale
    const brightness = Math.floor(255 * scale);
    
    for (let i = 0; i < 256; i++) {
      if (heartPattern[i]) {
        previewColors[i] = { 
          r: brightness, 
          g: Math.floor(brightness * 0.2), 
          b: Math.floor(brightness * 0.4) 
        };
      } else {
        previewColors[i] = { r: 0, g: 0, b: 0 };
      }
    }
    
    beat += 0.3;
  });
}

// ⭐ Spinning Star Animation
function demoSpinningStarAnim() {
  let angle = 0;
  const starColor = { r: 255, g: 215, b: 0 };
  
  runDemoLoop(80, () => {
    // Clear
    for (let i = 0; i < 256; i++) {
      previewColors[i] = { r: 0, g: 0, b: 0 };
    }
    
    // Draw rotating star
    const cx = 8, cy = 8;
    const points = 5;
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? 6 : 3;
      const a = angle + (i * Math.PI / points);
      const x = Math.round(cx + Math.cos(a) * radius);
      const y = Math.round(cy + Math.sin(a) * radius);
      
      if (x >= 0 && x < 16 && y >= 0 && y < 16) {
        const idx = y * 16 + x;
        previewColors[idx] = { ...starColor };
        // Fill neighbors for thicker lines
        if (x + 1 < 16) previewColors[idx + 1] = { ...starColor };
        if (y + 1 < 16) previewColors[idx + 16] = { ...starColor };
      }
    }
    
    angle += 0.15;
  });
}

// 🌈 Rainbow Wave Animation
function demoRainbowWaveAnim() {
  let offset = 0;
  
  runDemoLoop(100, () => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const idx = y * 16 + x;
        const hue = ((x + offset) * 20) % 360;
        const rgb = hslToRgb(hue / 360, 1, 0.5);
        previewColors[idx] = rgb;
      }
    }
    offset++;
  });
}

// 😄 Happy Face Animation
function demoSmileyAnim() {
  let blink = 0;
  const yellow = { r: 255, g: 220, b: 0 };
  const black = { r: 0, g: 0, b: 0 };
  
  // Simple smiley pattern
  const facePattern = [
    0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,
    0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,
    0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
    0,1,1,2,2,1,1,1,1,1,1,2,2,1,1,0,
    1,1,1,2,2,1,1,1,1,1,1,2,2,1,1,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,
    1,1,1,2,1,1,1,1,1,1,1,1,2,1,1,1,
    1,1,1,1,2,2,1,1,1,1,2,2,1,1,1,1,
    0,1,1,1,1,1,2,2,2,2,1,1,1,1,1,0,
    0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
    0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,
    0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
  ];
  
  runDemoLoop(100, () => {
    const showEyes = Math.floor(blink) % 20 > 1; // Blink occasionally
    
    for (let i = 0; i < 256; i++) {
      if (facePattern[i] === 1) {
        previewColors[i] = { ...yellow };
      } else if (facePattern[i] === 2) {
        previewColors[i] = showEyes ? { ...black } : { ...yellow };
      } else {
        previewColors[i] = { r: 0, g: 0, b: 0 };
      }
    }
    
    blink += 0.5;
  });
}

// 👁️ Blinking Eye Animation (dynamic 8×8 / 16×16)
function scaleBitsSquare(bits, srcSize, dstSize) {
  const out = new Array(dstSize * dstSize).fill(0);
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      const sx = Math.floor((x / dstSize) * srcSize);
      const sy = Math.floor((y / dstSize) * srcSize);
      out[y * dstSize + x] = bits[sy * srcSize + sx] ? 1 : 0;
    }
  }
  return out;
}

const BLINKING_EYE_8_FRAMES = [
  // open
  [
    0,0,1,1,1,1,0,0,
    0,1,0,0,0,0,1,0,
    1,0,1,1,1,1,0,1,
    1,0,1,0,0,1,0,1,
    1,0,1,0,0,1,0,1,
    1,0,1,1,1,1,0,1,
    0,1,0,0,0,0,1,0,
    0,0,1,1,1,1,0,0
  ],
  // half blink
  [
    0,0,0,0,0,0,0,0,
    0,1,1,1,1,1,1,0,
    1,0,0,0,0,0,0,1,
    0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,
    1,0,0,0,0,0,0,1,
    0,1,1,1,1,1,1,0,
    0,0,0,0,0,0,0,0
  ],
  // closed
  [
    0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,
    1,1,1,1,1,1,1,1,
    0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,
    1,1,1,1,1,1,1,1,
    0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0
  ]
];

function demoBlinkingEyeAnim() {
  let frame = 0;
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };

  // open → half → closed → half → open ...
  const seq = [0, 1, 2, 1, 0];

  runDemoLoop(120, () => {
    const size = getMatrixSize();
    ensurePreviewColorsSize();
    const n = size * size;

    const idx = seq[frame % seq.length];
    let bits = BLINKING_EYE_8_FRAMES[idx];

    if (size !== 8) {
      bits = scaleBitsSquare(bits, 8, size);
    }

    // Add a tiny pupil when open (center 2×2)
    if (idx === 0) {
      const cx = Math.floor(size / 2);
      const cy = Math.floor(size / 2);
      const pts = [[cx, cy], [cx - 1, cy], [cx, cy - 1], [cx - 1, cy - 1]];
      for (const [x, y] of pts) {
        if (x >= 0 && x < size && y >= 0 && y < size) {
          bits[y * size + x] = 1;
        }
      }
    }

    // Write into previewColors
    for (let i = 0; i < n; i++) {
      previewColors[i] = bits[i] ? { ...white } : { ...black };
    }

    frame++;
  });
}


// ⏳ Loading Bar Animation
function demoLoadingBarAnim() {
  let progress = 0;
  const green = { r: 0, g: 255, b: 0 };
  const gray = { r: 50, g: 50, b: 50 };
  
  runDemoLoop(150, () => {
    // Clear
    for (let i = 0; i < 256; i++) {
      previewColors[i] = { r: 0, g: 0, b: 0 };
    }
    
    // Draw loading bar (rows 7-8, centered)
    for (let x = 1; x < 15; x++) {
      const filled = x <= progress;
      const color = filled ? green : gray;
      
      previewColors[7 * 16 + x] = { ...color };
      previewColors[8 * 16 + x] = { ...color };
    }
    
    progress++;
    if (progress > 14) progress = 0;
  });
}

// 🎆 Fireworks Animation
function demoFireworksAnim() {
  let frame = 0;
  const colors = [
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 255, g: 255, b: 0 },
    { r: 255, g: 0, b: 255 }
  ];
  
  runDemoLoop(100, () => {
    // Clear
    for (let i = 0; i < 256; i++) {
      previewColors[i] = { r: 0, g: 0, b: 0 };
    }
    
    // Exploding circle
    const cx = 8, cy = 8;
    const radius = (frame % 15);
    const color = colors[Math.floor(frame / 15) % colors.length];
    
    for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
      const x = Math.round(cx + Math.cos(angle) * radius);
      const y = Math.round(cy + Math.sin(angle) * radius);
      
      if (x >= 0 && x < 16 && y >= 0 && y < 16) {
        const idx = y * 16 + x;
        const brightness = 1 - (radius / 15);
        previewColors[idx] = {
          r: Math.floor(color.r * brightness),
          g: Math.floor(color.g * brightness),
          b: Math.floor(color.b * brightness)
        };
      }
    }
    
    frame++;
  });
}

// 🏎️ Racing Car Animation
function demoRacingCarAnim() {
  let carX = 0;
  const carColor = { r: 255, g: 0, b: 0 };
  const roadColor = { r: 100, g: 100, b: 100 };
  
  runDemoLoop(100, () => {
    // Clear
    for (let i = 0; i < 256; i++) {
      previewColors[i] = { r: 0, g: 50, b: 0 }; // Grass
    }
    
    // Draw road (rows 7-9)
    for (let x = 0; x < 16; x++) {
      previewColors[7 * 16 + x] = { ...roadColor };
      previewColors[8 * 16 + x] = { ...roadColor };
      previewColors[9 * 16 + x] = { ...roadColor };
    }
    
    // Draw car (2x3 pixels)
    if (carX >= 0 && carX < 15) {
      previewColors[7 * 16 + carX] = { ...carColor };
      previewColors[7 * 16 + carX + 1] = { ...carColor };
      previewColors[8 * 16 + carX] = { ...carColor };
      previewColors[8 * 16 + carX + 1] = { ...carColor };
      previewColors[9 * 16 + carX] = { r: 0, g: 0, b: 0 }; // wheels
      previewColors[9 * 16 + carX + 1] = { r: 0, g: 0, b: 0 };
    }
    
    carX++;
    if (carX > 16) carX = -2;
  });
}

// 🛑 Stop Sign Animation (pulsating)
function demoStopSignAnim() {
  let pulse = 0;
  
  // STOP sign octagon pattern (simplified)
  const stopPattern = [
    0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,
    0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,
    0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
    0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
    1,1,1,1,2,2,1,2,2,1,2,2,1,1,1,1,
    1,1,1,1,2,1,1,2,2,1,2,1,1,1,1,1,
    1,1,1,1,2,2,1,2,2,1,2,2,1,1,1,1,
    1,1,1,1,2,1,1,2,2,1,2,1,1,1,1,1,
    1,1,1,1,2,1,1,2,2,1,2,1,1,1,1,1,
    1,1,1,1,2,2,1,2,2,1,2,2,1,1,1,1,
    0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
    0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
    0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,
    0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
  ];
  
  runDemoLoop(100, () => {
    const brightness = 0.7 + Math.sin(pulse) * 0.3;
    const red = Math.floor(255 * brightness);
    const white = Math.floor(255 * brightness);
    
    for (let i = 0; i < 256; i++) {
      if (stopPattern[i] === 1) {
        previewColors[i] = { r: red, g: 0, b: 0 };
      } else if (stopPattern[i] === 2) {
        previewColors[i] = { r: white, g: white, b: white };
      } else {
        previewColors[i] = { r: 0, g: 0, b: 0 };
      }
    }
    
    pulse += 0.2;
  });
}

// HSL to RGB helper for rainbow
function hslToRgb(h, s, l) {
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// Event listeners for demos
if (dom.demoWavingFlag) {
  dom.demoWavingFlag.addEventListener('click', () => startDemo(demoWavingFlagAnim));
}
if (dom.demoTrafficLight) {
  dom.demoTrafficLight.addEventListener('click', () => startDemo(demoTrafficLightAnim));
}
if (dom.demoHeartBeat) {
  dom.demoHeartBeat.addEventListener('click', () => startDemo(demoHeartBeatAnim));
}
if (dom.demoSpinningStar) {
  dom.demoSpinningStar.addEventListener('click', () => startDemo(demoSpinningStarAnim));
}
if (dom.demoRainbowWave) {
  dom.demoRainbowWave.addEventListener('click', () => startDemo(demoRainbowWaveAnim));
}
if (dom.demoSmiley) {
  dom.demoSmiley.addEventListener('click', () => startDemo(demoSmileyAnim));
}
if (dom.demoLoadingBar) {
  dom.demoLoadingBar.addEventListener('click', () => startDemo(demoLoadingBarAnim));
}
if (dom.demoFireworks) {
  dom.demoFireworks.addEventListener('click', () => startDemo(demoFireworksAnim));
}
if (dom.demoRacingCar) {
  dom.demoRacingCar.addEventListener('click', () => startDemo(demoRacingCarAnim));
}
if (dom.demoStopSign) {
  dom.demoStopSign.addEventListener('click', () => startDemo(demoStopSignAnim));
}
if (dom.demoBlinkingEye) {
  dom.demoBlinkingEye.addEventListener('click', () => startDemo(demoBlinkingEyeAnim));
}
if (dom.stopDemo) {
  dom.stopDemo.addEventListener('click', () => {
    stopDemoAnimation();
    log('Demo stopped', 'info');
  });
}

// Boot (after all functions + state are defined)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUI);
} else {
  initUI();
}
