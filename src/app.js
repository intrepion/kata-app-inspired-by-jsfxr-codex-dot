import { PARAMS, PRESETS, normalizeParams, renderSound, encodeWav, randomizeParams, mutateParams, serializeSettings, parseSettings } from './synth.js';
const $ = id => document.getElementById(id);
const RATE = 44100, STORAGE = 'kata-sound-lab.v1';
const presetNames = {coin:'Coin pickup',laser:'Laser zap',explosion:'Explosion',jump:'Jump',powerup:'Power-up',hit:'Hit / hurt',blip:'Blip / select',click:'Click'};
const icons = {
  coin:'<circle cx="12" cy="12" r="8"/><path d="M12 7v10m-2-8h3m-3 6h3"/>',
  laser:'<path d="m4 20 9-9m-3-5 4-4 8 8-4 4ZM11 5l8 8M4 12l3 1m4 7 1-3M4 3l3 3"/>',
  explosion:'<path d="m12 2 2 6 6-3-3 6 5 3-6 1 1 6-5-4-5 4 1-6-6-1 5-3-3-6 6 3Z"/>',
  jump:'<path d="M5 19h14M12 16V4m-5 5 5-5 5 5"/>',
  powerup:'<path d="m13 2-8 12h6l-1 8 9-13h-7Z"/>',
  hit:'<path d="m12 2 2 7 7-2-5 5 5 5-7-2-2 7-2-7-7 2 5-5-5-5 7 2Z"/>',
  blip:'<rect x="4" y="6" width="16" height="12" rx="3"/><path d="M8 10v4m-2-2h4m6 0h.01"/>',
  click:'<path d="m7 3 12 10-6 1-3 6Zm7 12 4 5"/>'
};
const wavePaths = {square:'M1 12V3h7v9h7V3h7',saw:'M1 12 8 3v9l7-9v9 7-9',triangle:'m1 8 5-6 10 12 6-6',sine:'M1 8C5-4 8-4 12 8s7 12 11 0',noise:'m1 8 3-4 2 7 3-9 2 12 4-9 2 5 2-6 3 4'};
let state = { params:{...PRESETS[0].params}, preset:'coin', title:presetNames.coin, name:'coin-pickup' };
let samples, undo = [], redo = [], editStart = null;
let audioContext, playing = null, playToken = 0, playStarted = 0, animation = 0, autoTimer;
let storageWorks = true;
const controls = new Map();
const cloneState = () => structuredClone(state);
function notify(message, error = false) { $('status').textContent = message; $('status').parentElement.classList.toggle('error', error); }
function seed() { const words = new Uint32Array(1); if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(words); else words[0] = Math.random() * 4294967296; return words[0]; }
function persist() {
  try { localStorage.setItem(STORAGE, JSON.stringify({...state, settings:serializeSettings(state.params)})); }
  catch { storageWorks = false; $('session-note').textContent = 'BROWSER SAVE UNAVAILABLE · EXPORT SETTINGS TO KEEP YOUR SOUND'; }
}
try {
  const raw = localStorage.getItem(STORAGE);
  if (raw) {
    const saved = JSON.parse(raw), params = parseSettings(saved.settings);
    state = { params, preset:PRESETS.some(p => p.id === saved.preset) ? saved.preset : null, title:typeof saved.title === 'string' ? saved.title.slice(0,60) : 'Saved sound', name:typeof saved.name === 'string' ? saved.name.slice(0,60) : 'my-sound' };
    notify('Your last sound is back. Press Preview sound to hear it.');
  }
} catch { notify('Could not restore the last sound. A fresh coin preset is ready.'); }
function remember(snapshot) {
  undo.push(snapshot); if (undo.length > 40) undo.shift(); redo = [];
}
function refreshButtons() {
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
  document.querySelectorAll('.preset').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === state.preset)));
}
function render() {
  samples = renderSound(state.params, RATE);
  $('sound-title').textContent = state.title;
  $('filename').value = state.name;
  $('seed').value = state.params.seed;
  $('wave-info').textContent = `${state.params.wave.toUpperCase()} WAVE`;
  $('duration-info').textContent = `${(samples.length / RATE).toFixed(2)} s`;
  $('file-info').textContent = `${((44 + samples.length * 2) / 1024).toFixed(1)} KB · ${samples.length.toLocaleString()} samples`;
  $('waveform').setAttribute('aria-label', `${state.title}: ${state.params.wave} waveform, ${(samples.length / RATE).toFixed(2)} seconds`);
  for (const [key, {range, number, field}] of controls) {
    const decimals = (String(field.step).split('.')[1] || '').length;
    range.disabled = number.disabled = state.params.wave === 'noise' && ['frequency','slide','vibrato','vibratoRate'].includes(key);
    range.value = state.params[key]; number.value = Number(state.params[key].toFixed(Math.max(decimals, 2)));
    range.style.setProperty('--fill', `${(state.params[key]-field.min)/(field.max-field.min)*100}%`);
  }
  $('wave-hint').hidden = state.params.wave !== 'noise';
  const radio = document.querySelector(`input[name="wave"][value="${state.params.wave}"]`); if (radio) radio.checked = true;
  refreshButtons(); drawWaveform();
}
function change(next, message, {preview = true} = {}) {
  clearTimeout(autoTimer); editStart = null; stop();
  remember(cloneState()); state = {...next, params:normalizeParams(next.params)};
  render(); persist(); notify(message);
  if (preview && $('auto-preview').checked) play();
}
function edit(key, value, finish = false) {
  if (!Number.isFinite(value)) { render(); notify('Enter a finite number for this setting.', true); return; }
  if (!editStart) editStart = cloneState();
  if (playing) stop();
  state.params = normalizeParams({...state.params, [key]:value});
  render(); persist();
  clearTimeout(autoTimer);
  if ($('auto-preview').checked) autoTimer = setTimeout(play, 140);
  if (finish) { if (JSON.stringify(editStart.params) !== JSON.stringify(state.params)) remember(editStart); editStart = null; refreshButtons(); notify('Sound updated. Preview it, or download your WAV.'); }
}
function drawWaveform(progress = 0) {
  const canvas = $('waveform'), box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(box.width * dpr)), height = Math.max(1, Math.round(box.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d');
  if (!ctx || !samples) return;
  ctx.clearRect(0,0,width,height);
  ctx.lineWidth = dpr; ctx.strokeStyle = '#9ac6a11a'; ctx.beginPath();
  for (let x = 0; x <= width; x += width / 12) { ctx.moveTo(x,0); ctx.lineTo(x,height); }
  for (let y = 0; y <= height; y += height / 4) { ctx.moveTo(0,y); ctx.lineTo(width,y); }
  ctx.stroke();
  ctx.strokeStyle = '#a7dbae40'; ctx.beginPath(); ctx.moveTo(0,height/2);ctx.lineTo(width,height/2);ctx.stroke();
  const columns = Math.floor(width / dpr), perColumn = samples.length / columns;
  ctx.strokeStyle = '#b7edb3'; ctx.lineWidth = Math.max(1, dpr * 0.75); ctx.beginPath();
  for (let x = 0; x < columns; x++) {
    const start = Math.floor(x * perColumn), end = Math.max(start+1,Math.min(samples.length,Math.floor((x+1)*perColumn)));
    let min = 0, max = 0;
    for (let i=start;i<end;i++) { min = Math.min(min,samples[i]); max=Math.max(max,samples[i]); }
    ctx.moveTo(x*dpr, height/2-min*height*.8); ctx.lineTo(x*dpr, height/2-max*height*.8);
  }
  ctx.stroke();
  if (progress > 0) { ctx.strokeStyle = '#f1c787'; ctx.lineWidth=dpr;ctx.beginPath();ctx.moveTo(progress*width,0);ctx.lineTo(progress*width,height);ctx.stroke(); }
}
function setPlaying(value) {
  $('signal-state').textContent = value ? 'PLAYING' : 'READY'; $('signal-state').classList.toggle('playing',value);
  $('play').querySelector('span').textContent = value ? 'Stop preview' : 'Preview sound';
  $('play').querySelector('svg path').setAttribute('d', value ? 'M6 6h12v12H6Z' : 'm8 5 11 7-11 7Z');
}
function stop({announce = false} = {}) {
  playToken++; cancelAnimationFrame(animation);
  if (playing) {
    const current = playing; playing = null; current.source.onended = null;
    try { current.gain.gain.cancelScheduledValues(audioContext.currentTime); current.gain.gain.setValueAtTime(current.gain.gain.value,audioContext.currentTime);current.gain.gain.linearRampToValueAtTime(0,audioContext.currentTime+0.008);current.source.stop(audioContext.currentTime+0.01);current.source.onended=()=>{current.source.disconnect();current.gain.disconnect();}; } catch { current.source.disconnect();current.gain.disconnect(); }
  }
  setPlaying(false); drawWaveform(); if (announce) notify('Preview stopped.');
}
async function play() {
  clearTimeout(autoTimer); stop(); const token = playToken;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('This browser does not support Web Audio. You can still download WAV files.');
    audioContext ||= new Audio();
    if (audioContext.state !== 'running') await audioContext.resume();
    if (token !== playToken) return;
    if (audioContext.state !== 'running') throw new Error('Audio is paused by the browser. Press Preview sound again to enable it.');
    const buffer = audioContext.createBuffer(1,samples.length,RATE); buffer.copyToChannel(samples,0);
    const source = audioContext.createBufferSource(), gain = audioContext.createGain(); source.buffer=buffer;
    gain.gain.value=0.7; source.connect(gain); gain.connect(audioContext.destination);
    playing = {source,gain}; playStarted=audioContext.currentTime; setPlaying(true);
    source.onended=()=>{source.disconnect();gain.disconnect();if(playing?.source===source){playing=null;cancelAnimationFrame(animation);setPlaying(false);drawWaveform();notify('Preview finished. Keep shaping, or take it with you.');}};
    source.start(); notify(`Playing ${state.title.toLowerCase()}.`);
    const animate = () => { if (playing?.source !== source) return; drawWaveform(Math.min(1,(audioContext.currentTime-playStarted)/buffer.duration)); animation=requestAnimationFrame(animate); };
    animate();
  } catch (error) { setPlaying(false); notify(error.message || 'Audio preview could not start. Try Preview sound again.', true); }
}
for (const preset of PRESETS) {
  const button=document.createElement('button'); button.className='preset';button.dataset.preset=preset.id;button.title=preset.description;
  button.innerHTML=`<span class="preset-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[preset.id]}</svg></span><span>${presetNames[preset.id]}</span>`;
  button.addEventListener('click',()=>change({params:{...preset.params},preset:preset.id,title:presetNames[preset.id],name:preset.id==='coin'?'coin-pickup':preset.id},preset.description));
  $('presets').append(button);
}
for (const wave of PARAMS.find(field=>field.key==='wave').options) {
  const option=document.createElement('div'); option.className='wave-option';
  option.innerHTML=`<input type="radio" name="wave" id="wave-${wave.value}" value="${wave.value}"><label for="wave-${wave.value}"><svg aria-hidden="true" viewBox="0 0 24 16"><path d="${wavePaths[wave.value]}"/></svg>${wave.label==='Sawtooth'?'Saw':wave.label}</label>`;
  option.querySelector('input').addEventListener('change',()=>change({...state,params:{...state.params,wave:wave.value}},`${wave.label} waveform selected.`));
  $('wave-options').append(option);
}
function buildControl(key,parent) {
  const field=PARAMS.find(field=>field.key===key); const element=document.createElement('div');element.className='control';
  element.innerHTML=`<div class="control-top"><label for="${key}">${field.label}</label><div class="value-wrap"><input id="${key}-number" type="number" aria-label="${field.label}, numeric value" min="${field.min}" max="${field.max}" step="${field.step}"><span>${field.unit||''}</span></div></div><input id="${key}" type="range" min="${field.min}" max="${field.max}" step="${field.step}" aria-label="${field.label}">`;
  const range=element.querySelector('input[type=range]'),number=element.querySelector('input[type=number]');
  range.addEventListener('input',()=>edit(key,Number(range.value))); range.addEventListener('change',()=>edit(key,Number(range.value),true));
  number.addEventListener('change',()=>{if(number.value===''){render();return;}edit(key,Number(number.value),true);});
  controls.set(key,{range,number,field}); parent.append(element);
}
for (const [title,keys] of [['TONE & LEVEL',['frequency','slide','volume']],['ENVELOPE',['duration','attack','release']]]) {
  const group=document.createElement('section'),heading=document.createElement('h3');heading.className='group-title';heading.textContent=title;group.append(heading);
  for(const key of keys) buildControl(key,group); $('control-groups').append(group);
}
for (const key of ['vibrato','vibratoRate','punch','lowpass','crunch']) buildControl(key,$('texture-controls'));
$('play').addEventListener('click',()=>playing?stop({announce:true}):play());
$('auto-preview').addEventListener('change',()=>{clearTimeout(autoTimer);notify($('auto-preview').checked?'Auto-preview is on. Changes will play at a reduced preview level.':'Auto-preview is off. Press Preview sound when you are ready.');});
$('randomize').addEventListener('click',()=>change({params:randomizeParams(seed()),preset:null,title:'Happy accident',name:'happy-accident'},'A fresh idea. Mutate it to explore nearby sounds.'));
$('mutate').addEventListener('click',()=>change({...state,params:mutateParams(state.params,seed()),title:`${state.title.replace(/ · variation$/,'')} · variation`},'A small variation. Undo takes you back.'));
$('reset').addEventListener('click',()=>{const preset=PRESETS.find(p=>p.id===state.preset)||PRESETS[0];change({params:{...preset.params},preset:preset.id,title:presetNames[preset.id],name:preset.id==='coin'?'coin-pickup':preset.id},`${presetNames[preset.id]} reset to its original settings.`);});
$('undo').addEventListener('click',()=>{if(!undo.length)return;clearTimeout(autoTimer);editStart=null;stop();redo.push(cloneState());state=undo.pop();render();persist();notify('Previous sound restored.');});
$('redo').addEventListener('click',()=>{if(!redo.length)return;clearTimeout(autoTimer);editStart=null;stop();undo.push(cloneState());state=redo.pop();render();persist();notify('Change restored.');});
$('seed').addEventListener('change',()=>{if($('seed').value===''){render();return;}edit('seed',Number($('seed').value),true);});
$('filename').addEventListener('input',()=>{state.name=$('filename').value.slice(0,60);persist();});
function filename(extension){return `${(state.name.trim().replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'kata-sound')}.${extension}`;}
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
$('download-wav').addEventListener('click',()=>{try{download(encodeWav(samples,RATE),'audio/wav',filename('wav'));notify('WAV download started. Use it in your game, video, or next experiment.');}catch(error){notify(`Could not export WAV: ${error.message}`,true);}});
$('download-settings').addEventListener('click',()=>{download(serializeSettings(state.params),'application/json',filename('json'));notify('Settings download started. Open the JSON here to reproduce this sound.');});
$('import-settings').addEventListener('click',()=>$('settings-file').click());
$('settings-file').addEventListener('change',async event=>{
  const file=event.target.files[0]; if(!file)return;
  try{if(file.size>16384)throw new Error('Settings must be smaller than 16 KB.');const params=parseSettings(await file.text());change({params,preset:null,title:'Imported sound',name:file.name.replace(/\.json$/i,'').slice(0,60)},'Settings opened. This sound is ready to edit or export.',{preview:false});}
  catch(error){notify(`Could not open settings: ${error.message} Your current sound is unchanged.`,true);}
  finally{event.target.value='';}
});
document.addEventListener('keydown',event=>{if(event.code!=='Space'||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;if(event.target.closest('input,textarea,select,button,summary,a,[contenteditable]'))return;event.preventDefault();playing?stop({announce:true}):play();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(autoTimer);stop();}});
window.addEventListener('pagehide',()=>{clearTimeout(autoTimer);stop();});
new ResizeObserver(()=>drawWaveform()).observe($('waveform'));
render();
if (!storageWorks) notify('Browser storage is unavailable. Export settings to keep your sound.');
