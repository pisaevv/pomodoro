import React from 'react'
import { css } from './css.js'
import HoverButton from './HoverButton.jsx'

const KEY = 'pomodoro.v1'

export default class PomodoroTimer extends React.Component {
  state = {
    mode: 'focus',
    running: false,
    endTime: null,
    remaining: 25 * 60,
    completedToday: 0,
    cycle: 0,
    durations: { focus: 25, short: 5, long: 15 },
    longEvery: 4,
    task: '',
    theme: 'dark',
    soundOn: true,
    autoCycle: true,
    settingsOpen: false,
    today: '',
  }

  componentDidMount() {
    this.hydrate()
    this.interval = setInterval(() => this.tick(), 250)
    window.addEventListener('keydown', this.onKey)
    document.addEventListener('visibilitychange', this.onVis)
  }

  componentWillUnmount() {
    clearInterval(this.interval)
    window.removeEventListener('keydown', this.onKey)
    document.removeEventListener('visibilitychange', this.onVis)
    this.releaseWakeLock()
  }

  componentDidUpdate() { this.save() }

  // ---------- persistence ----------
  save() {
    try {
      const s = this.state
      localStorage.setItem(KEY, JSON.stringify({
        durations: s.durations, longEvery: s.longEvery, task: s.task, theme: s.theme,
        soundOn: s.soundOn, autoCycle: s.autoCycle, completedToday: s.completedToday,
        cycle: s.cycle, mode: s.mode, running: s.running, endTime: s.endTime,
        remaining: s.remaining, today: s.today,
      }))
    } catch (e) {}
  }

  hydrate() {
    let saved = null
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null') } catch (e) {}
    const today = new Date().toDateString()
    if (!saved) { this.setState({ today }, () => this.updateTitle()); return }
    const next = { ...saved }
    if (saved.today !== today) { next.completedToday = 0; next.today = today }
    if (saved.running && saved.endTime) {
      if (saved.endTime > Date.now()) {
        next.remaining = Math.max(0, Math.round((saved.endTime - Date.now()) / 1000))
        next.running = true
      } else {
        Object.assign(next, this.nextStateAfter(saved, true), { running: false, endTime: null })
      }
    }
    this.setState(next, () => this.updateTitle())
  }

  // ---------- core loop ----------
  tick() {
    if (!this.state.running) return
    const rem = Math.max(0, Math.round((this.state.endTime - Date.now()) / 1000))
    if (rem !== this.state.remaining) this.setState({ remaining: rem }, () => this.updateTitle())
    if (rem <= 0) this.complete()
  }

  nextStateAfter(s, completed) {
    const { mode, cycle, completedToday, durations, longEvery } = s
    let nextMode, nextCycle = cycle, nextCompleted = completedToday
    if (mode === 'focus') {
      if (completed) { nextCompleted++; nextCycle = cycle + 1 }
      nextMode = (nextCycle % longEvery === 0) ? 'long' : 'short'
    } else if (mode === 'short') {
      nextMode = 'focus'
    } else {
      nextMode = 'focus'
      nextCycle = 0
    }
    return {
      mode: nextMode, cycle: nextCycle, completedToday: nextCompleted,
      remaining: (durations[nextMode] || 1) * 60,
    }
  }

  complete() {
    this.playChime()
    this.notify()
    this.advance(true)
  }

  advance(completed) {
    const part = this.nextStateAfter(this.state, completed)
    const running = completed && this.state.autoCycle
    const endTime = running ? Date.now() + part.remaining * 1000 : null
    this.setState({ ...part, running, endTime }, () => this.updateTitle())
    if (running) this.requestWakeLock(); else this.releaseWakeLock()
  }

  // ---------- controls ----------
  toggle() { this.state.running ? this.pause() : this.start() }

  start() {
    this.ensureNotifyPermission()
    this.unlockAudio()
    this.requestWakeLock()
    this.setState(s => {
      const remaining = s.remaining <= 0 ? (s.durations[s.mode] || 1) * 60 : s.remaining
      return { running: true, remaining, endTime: Date.now() + remaining * 1000 }
    }, () => this.updateTitle())
  }

  pause() {
    this.releaseWakeLock()
    this.setState(s => ({
      running: false,
      remaining: Math.max(0, Math.round((s.endTime - Date.now()) / 1000)),
    }), () => this.updateTitle())
  }

  reset() {
    this.releaseWakeLock()
    this.setState(s => ({ running: false, endTime: null, remaining: (s.durations[s.mode] || 1) * 60 }),
      () => this.updateTitle())
  }

  skip() {
    this.releaseWakeLock()
    const part = this.nextStateAfter(this.state, false)
    this.setState({ ...part, running: false, endTime: null }, () => this.updateTitle())
  }

  switchMode(m) {
    this.releaseWakeLock()
    this.setState(s => ({ mode: m, running: false, endTime: null, remaining: (s.durations[m] || 1) * 60 }),
      () => this.updateTitle())
  }

  setTask(e) { this.setState({ task: e.target.value }) }
  toggleTheme() { this.setState(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })) }

  adjustDur(key, dir) {
    const cfg = {
      focus: { min: 5, max: 90, step: 5 },
      short: { min: 1, max: 30, step: 1 },
      long: { min: 5, max: 45, step: 5 },
    }[key]
    this.setState(s => {
      const v = Math.min(cfg.max, Math.max(cfg.min, (s.durations[key] || cfg.min) + dir * cfg.step))
      const durations = { ...s.durations, [key]: v }
      const extra = (!s.running && s.mode === key) ? { remaining: v * 60 } : {}
      return { durations, ...extra }
    }, () => this.updateTitle())
  }

  setDur(key, value) {
    const cfg = {
      focus: { min: 5, max: 90 },
      short: { min: 1, max: 30 },
      long: { min: 5, max: 45 },
    }[key]
    const v = Math.min(cfg.max, Math.max(cfg.min, Math.round(Number(value) || cfg.min)))
    this.setState(s => {
      const durations = { ...s.durations, [key]: v }
      const extra = (!s.running && s.mode === key) ? { remaining: v * 60 } : {}
      return { durations, ...extra }
    }, () => this.updateTitle())
  }

  setEvery(value) {
    const v = Math.min(8, Math.max(2, Math.round(Number(value) || 2)))
    this.setState({ longEvery: v })
  }

  adjustEvery(delta) {
    this.setState(s => ({ longEvery: Math.min(8, Math.max(2, s.longEvery + delta)) }))
  }

  // ---------- side effects ----------
  updateTitle() {
    const s = this.state
    const rem = Math.max(0, s.remaining)
    const m = String(Math.floor(rem / 60)).padStart(2, '0')
    const sec = String(rem % 60).padStart(2, '0')
    const label = s.mode === 'focus' ? 'Focus' : 'Break'
    document.title = s.running ? `${m}:${sec} · ${label}` : 'Pomodoro'
  }

  unlockAudio() {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume()
    } catch (e) {}
  }

  playChime() {
    if (!this.state.soundOn) return
    try {
      this.unlockAudio()
      const ctx = this.audioCtx
      if (!ctx) return
      const now = ctx.currentTime
      const notes = this.state.mode === 'focus' ? [880, 1174.66] : [659.25, 987.77]
      notes.forEach((freq, i) => {
        const t = now + i * 0.17
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = 'sine'
        o.frequency.value = freq
        o.connect(g); g.connect(ctx.destination)
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.28, t + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
        o.start(t); o.stop(t + 1)
      })
    } catch (e) {}
  }

  ensureNotifyPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    } catch (e) {}
  }

  notify() {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const focus = this.state.mode === 'focus'
        new Notification(focus ? 'Focus complete' : 'Break over', {
          body: focus ? 'Nice work — time for a break.' : 'Back to it. Time to focus.',
        })
      }
    } catch (e) {}
  }

  async requestWakeLock() {
    try { if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen') } catch (e) {}
  }
  releaseWakeLock() {
    try { if (this.wakeLock) { this.wakeLock.release(); this.wakeLock = null } } catch (e) {}
  }

  onVis = () => {
    if (document.visibilityState === 'visible' && this.state.running && !this.wakeLock) this.requestWakeLock()
  }

  onKey = (e) => {
    if (e.code !== 'Space') return
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    e.preventDefault()
    this.toggle()
  }

  // ---------- view model ----------
  renderVals() {
    const s = this.state
    const mode = s.mode
    const dark = s.theme !== 'light'
    const accents = {
      focus: this.props.accentColor ?? '#D8A657',
      short: this.props.shortBreakColor ?? '#8FA391',
      long: this.props.longBreakColor ?? '#8794AB',
    }
    const accent = accents[mode]
    const rgb = dark ? '243,242,238' : '26,26,28'
    const c = {
      bg: dark ? '#0A0A0B' : '#F3F2EE',
      ink: dark ? '#F3F2EE' : '#1A1A1C',
      inkDim: `rgba(${rgb},0.55)`,
      inkFaint: `rgba(${rgb},0.32)`,
      track: `rgba(${rgb},0.10)`,
      hair: `rgba(${rgb},0.15)`,
      surface: dark ? '#141416' : '#FFFFFF',
      accent,
      accentInk: '#15110A',
      glow: `color-mix(in oklab, ${accent} 45%, transparent)`,
      accentWash: `color-mix(in oklab, ${accent} 12%, transparent)`,
      accentWashHi: `color-mix(in oklab, ${accent} 22%, transparent)`,
    }

    const total = Math.max(1, (s.durations[mode] || 1) * 60)
    const remaining = Math.max(0, s.remaining)
    const R = 110, C = 2 * Math.PI * R
    const frac = Math.min(1, Math.max(0, remaining / total))
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
    const ss = String(remaining % 60).padStart(2, '0')
    const phrases = { focus: 'Time to focus', short: 'Short break', long: 'Long break' }
    const statusText = s.running ? 'In progress' : (remaining < total ? 'Paused' : 'Ready')

    const longEvery = s.longEvery
    const filled = s.cycle === 0 ? 0 : ((s.cycle - 1) % longEvery) + 1
    const dots = Array.from({ length: longEvery }, (_, i) => ({ bg: i < filled ? c.ink : c.track }))

    const tab = (m_) => m_ === mode
      ? `background:none;border:none;padding:4px 2px;cursor:pointer;font:700 13px/1 'Space Mono',monospace;letter-spacing:.22em;text-transform:uppercase;color:${accent};transition:color .3s;`
      : `background:none;border:none;padding:4px 2px;cursor:pointer;font:700 13px/1 'Space Mono',monospace;letter-spacing:.22em;text-transform:uppercase;color:${c.inkFaint};transition:color .3s;`

    const sw = (on) => ({
      track: `width:44px;height:24px;border-radius:20px;border:1.5px solid ${on ? accent : c.hair};background:${on ? accent : 'transparent'};position:relative;cursor:pointer;flex:none;transition:all .25s;`,
      knob: `position:absolute;top:50%;left:${on ? '21px' : '2px'};width:17px;height:17px;border-radius:50%;background:${on ? c.accentInk : c.inkDim};transform:translateY(-50%);transition:all .25s;`,
    })

    const sideBtn = `width:62px;height:62px;border-radius:50%;border:1.5px solid ${c.hair};background:transparent;color:${c.inkDim};cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .25s;`
    const startBtn = `width:96px;height:96px;border-radius:50%;border:none;background:${accent};color:${c.accentInk};cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px ${accent}, 0 8px 40px ${c.glow};transition:transform .2s,box-shadow .3s;`

    const honey = accents.focus
    const rangeStyle = (val, min, max) => {
      const pct = Math.round(((val - min) / (max - min)) * 100)
      return `background:linear-gradient(to right, ${honey} 0%, ${honey} ${pct}%, ${c.track} ${pct}%, ${c.track} 100%);`
    }

    return {
      c, mm, ss, ringDash: C, ringOffset: C * (1 - frac),
      modePhrase: phrases[mode], statusText,
      ringAnim: s.running ? 'animation:breathe 5s ease-in-out infinite;' : '',
      task: s.task, setTask: (e) => this.setTask(e),
      running: s.running, notRunning: !s.running,
      toggle: () => this.toggle(), reset: () => this.reset(), skip: () => this.skip(),
      setFocus: () => this.switchMode('focus'), setShort: () => this.switchMode('short'), setLong: () => this.switchMode('long'),
      tFocus: tab('focus'), tShort: tab('short'), tLong: tab('long'),
      dots, setText: `${filled} / ${longEvery} to long break`,
      completedToday: s.completedToday,
      sideBtn, startBtn,
      toggleSettings: () => this.setState(st => ({ settingsOpen: !st.settingsOpen })),
      closeSettings: () => this.setState({ settingsOpen: false }),
      stop: (e) => e.stopPropagation(),
      settingsOpen: s.settingsOpen,
      toggleTheme: () => this.toggleTheme(), themeLabel: dark ? 'Dark' : 'Light',
      swTheme: sw(dark), swAuto: sw(s.autoCycle), swSound: sw(s.soundOn),
      toggleAutoCycle: () => this.setState(st => ({ autoCycle: !st.autoCycle })),
      toggleSound: () => this.setState(st => ({ soundOn: !st.soundOn })),
      d: s.durations, longEvery,
      rFocus: rangeStyle(s.durations.focus, 5, 90),
      rShort: rangeStyle(s.durations.short, 1, 30),
      rLong: rangeStyle(s.durations.long, 5, 45),
      rEvery: rangeStyle(longEvery, 2, 8),
      h: {
        focusSet: (e) => this.setDur('focus', e.target.value),
        shortSet: (e) => this.setDur('short', e.target.value),
        longSet: (e) => this.setDur('long', e.target.value),
        everySet: (e) => this.setEvery(e.target.value),
      },
    }
  }

  render() {
    const v = this.renderVals()
    return (
      <div style={css(`min-height:100vh;width:100%;display:flex;flex-direction:column;background:${v.c.bg};font-family:'Space Grotesk',sans-serif;color:${v.c.ink};transition:background-color .5s,color .5s;overflow:hidden;`)}>

        <div style={css('flex:none;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:clamp(24px,3.4vw,46px) clamp(24px,3.6vw,52px) 0;')}>
          <div style={css('display:flex;flex-direction:column;gap:8px;max-width:360px;min-width:0;flex:1;')}>
            <span style={css(`font:700 10px/1 'Space Mono',monospace;letter-spacing:.24em;color:${v.c.inkFaint};text-transform:uppercase;`)}>Focusing on</span>
            <input value={v.task} onChange={v.setTask} placeholder="What are you working on?" style={css(`width:100%;border:none;border-bottom:1.5px solid ${v.c.hair};background:transparent;color:${v.c.ink};font:500 16px/1.3 'Space Grotesk',sans-serif;padding:0 0 7px;outline:none;`)} />
          </div>
          <div style={css('display:flex;align-items:center;gap:18px;flex:none;')}>
            <div style={css('display:flex;align-items:center;gap:9px;')}>
              <span style={css(`font:700 10px/1 'Space Mono',monospace;letter-spacing:.18em;color:${v.c.inkFaint};text-transform:uppercase;`)}>{v.themeLabel}</span>
              <div onClick={v.toggleTheme} style={css(v.swTheme.track)}><div style={css(v.swTheme.knob)}></div></div>
            </div>
            <HoverButton onClick={v.toggleSettings} style={css(`display:flex;align-items:center;gap:9px;padding:11px 18px;border:1.5px solid ${v.c.accent};border-radius:100px;background:${v.c.accentWash};color:${v.c.accent};font:700 10px/1 'Space Mono',monospace;letter-spacing:.16em;cursor:pointer;text-transform:uppercase;transition:all .25s;`)} hoverStyle={css(`background:${v.c.accentWashHi}`)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              Settings
            </HoverButton>
          </div>
        </div>

        <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(22px,3.6vh,46px);padding:20px;')}>

          <div style={css('display:flex;gap:clamp(20px,3vw,40px);')}>
            <button onClick={v.setFocus} style={css(v.tFocus)}>Focus</button>
            <button onClick={v.setShort} style={css(v.tShort)}>Short</button>
            <button onClick={v.setLong} style={css(v.tLong)}>Long</button>
          </div>

          <div style={css(`position:relative;width:clamp(280px,44vh,460px);height:clamp(280px,44vh,460px);${v.ringAnim}`)}>
            <svg width="100%" height="100%" viewBox="0 0 240 240" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
              <circle cx="120" cy="120" r="110" fill="none" stroke={v.c.track} strokeWidth="4"></circle>
              <circle cx="120" cy="120" r="110" fill="none" stroke={v.c.accent} strokeWidth="4" strokeLinecap="round" strokeDasharray={v.ringDash} strokeDashoffset={v.ringOffset} style={css(`transition:stroke-dashoffset .95s linear,stroke .45s;filter:drop-shadow(0 0 6px ${v.c.glow});`)}></circle>
            </svg>
            <div style={css('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(10px,1.6vh,18px);')}>
              <span style={css(`font:700 11px/1 'Space Mono',monospace;letter-spacing:.28em;color:${v.c.accent};text-transform:uppercase;`)}>{v.modePhrase}</span>
              <div style={css(`display:flex;align-items:baseline;font:700 clamp(64px,13vh,132px)/0.9 'Space Grotesk',sans-serif;letter-spacing:-.03em;color:${v.c.ink};font-variant-numeric:tabular-nums;`)}>
                <span>{v.mm}</span><span style={css(`color:${v.c.accent};padding:0 .03em;`)}>:</span><span>{v.ss}</span>
              </div>
              <span style={css(`font:700 10px/1 'Space Mono',monospace;letter-spacing:.3em;color:${v.c.inkFaint};text-transform:uppercase;`)}>{v.statusText}</span>
            </div>
          </div>

          <div style={css('display:flex;flex-direction:column;align-items:center;gap:12px;')}>
            <div style={css('display:flex;gap:11px;')}>
              {v.dots.map((dot, i) => (
                <div key={i} style={css(`width:9px;height:9px;border-radius:50%;background:${dot.bg};transition:background-color .3s;`)}></div>
              ))}
            </div>
            <span style={css(`font:700 10px/1 'Space Mono',monospace;letter-spacing:.2em;color:${v.c.inkFaint};text-transform:uppercase;`)}>{v.setText}</span>
          </div>

          <div style={css('display:flex;align-items:center;gap:clamp(20px,3vw,36px);margin-top:clamp(4px,1vh,12px);')}>
            <HoverButton onClick={v.reset} title="Reset" style={css(v.sideBtn)} hoverStyle={css(`transform:scale(1.06);border-color:${v.c.inkDim}`)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="2.6" height="14" rx="1"></rect><polygon points="20,5 20,19 9,12"></polygon></svg>
            </HoverButton>
            <HoverButton onClick={v.toggle} style={css(v.startBtn)} hoverStyle={css('transform:scale(1.04)')}>
              {v.running && <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"></rect><rect x="14" y="5" width="4" height="14" rx="1.5"></rect></svg>}
              {v.notRunning && <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '4px' }}><polygon points="8,5 8,19 20,12"></polygon></svg>}
            </HoverButton>
            <HoverButton onClick={v.skip} title="Skip" style={css(v.sideBtn)} hoverStyle={css(`transform:scale(1.06);border-color:${v.c.inkDim}`)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="4,5 4,19 15,12"></polygon><rect x="16.4" y="5" width="2.6" height="14" rx="1"></rect></svg>
            </HoverButton>
          </div>

        </div>

        <div style={css('flex:none;display:flex;justify-content:center;padding:0 24px clamp(28px,4vh,46px);')}>
          <div style={css('display:flex;align-items:baseline;gap:10px;')}>
            <span style={css(`font:700 22px/1 'Space Grotesk',sans-serif;color:${v.c.ink};font-variant-numeric:tabular-nums;`)}>{v.completedToday}</span>
            <span style={css(`font:700 10px/1 'Space Mono',monospace;letter-spacing:.2em;color:${v.c.inkFaint};text-transform:uppercase;`)}>Completed today</span>
          </div>
        </div>

        {v.settingsOpen && (
          <div onClick={v.closeSettings} style={css('position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(4,4,6,0.62);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);')}>
            <div onClick={v.stop} style={css(`--pm-surface:${v.c.surface};width:100%;max-width:420px;background:${v.c.surface};border:1.5px solid ${v.c.hair};border-radius:24px;padding:28px 28px 26px;display:flex;flex-direction:column;gap:18px;box-shadow:0 40px 100px rgba(0,0,0,0.55);`)}>
              <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
                <span style={css(`font:700 11px/1 'Space Mono',monospace;letter-spacing:.24em;color:${v.c.inkDim};text-transform:uppercase;`)}>Settings</span>
                <HoverButton onClick={v.closeSettings} style={css(`width:32px;height:32px;border-radius:50%;border:1.5px solid ${v.c.hair};background:transparent;color:${v.c.inkDim};font:400 18px/1 'Space Grotesk',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .25s;`)} hoverStyle={css(`border-color:${v.c.inkDim}`)}>×</HoverButton>
              </div>

              <div style={css('display:flex;flex-direction:column;gap:11px;')}>
                <div style={css('display:flex;align-items:baseline;justify-content:space-between;')}>
                  <span style={css(`font:700 11px/1 'Space Mono',monospace;letter-spacing:.08em;color:${v.c.ink};text-transform:uppercase;`)}>Focus</span>
                  <span style={css(`font:700 15px/1 'Space Grotesk',sans-serif;color:${v.c.accent};font-variant-numeric:tabular-nums;`)}>{v.d.focus} min</span>
                </div>
                <input type="range" className="pm-range" min="5" max="90" step="5" value={v.d.focus} onChange={v.h.focusSet} style={css(v.rFocus)} />
              </div>
              <div style={css('display:flex;flex-direction:column;gap:11px;')}>
                <div style={css('display:flex;align-items:baseline;justify-content:space-between;')}>
                  <span style={css(`font:700 11px/1 'Space Mono',monospace;letter-spacing:.08em;color:${v.c.ink};text-transform:uppercase;`)}>Short break</span>
                  <span style={css(`font:700 15px/1 'Space Grotesk',sans-serif;color:${v.c.accent};font-variant-numeric:tabular-nums;`)}>{v.d.short} min</span>
                </div>
                <input type="range" className="pm-range" min="1" max="30" step="1" value={v.d.short} onChange={v.h.shortSet} style={css(v.rShort)} />
              </div>
              <div style={css('display:flex;flex-direction:column;gap:11px;')}>
                <div style={css('display:flex;align-items:baseline;justify-content:space-between;')}>
                  <span style={css(`font:700 11px/1 'Space Mono',monospace;letter-spacing:.08em;color:${v.c.ink};text-transform:uppercase;`)}>Long break</span>
                  <span style={css(`font:700 15px/1 'Space Grotesk',sans-serif;color:${v.c.accent};font-variant-numeric:tabular-nums;`)}>{v.d.long} min</span>
                </div>
                <input type="range" className="pm-range" min="5" max="45" step="5" value={v.d.long} onChange={v.h.longSet} style={css(v.rLong)} />
              </div>
              <div style={css('display:flex;flex-direction:column;gap:11px;')}>
                <div style={css('display:flex;align-items:baseline;justify-content:space-between;')}>
                  <span style={css(`font:700 11px/1 'Space Mono',monospace;letter-spacing:.08em;color:${v.c.ink};text-transform:uppercase;`)}>Long break after</span>
                  <span style={css(`font:700 15px/1 'Space Grotesk',sans-serif;color:${v.c.accent};font-variant-numeric:tabular-nums;`)}>{v.longEvery}×</span>
                </div>
                <input type="range" className="pm-range" min="2" max="8" step="1" value={v.longEvery} onChange={v.h.everySet} style={css(v.rEvery)} />
              </div>

              <div style={css(`height:1.5px;background:${v.c.hair};`)}></div>

              <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
                <span style={css(`font:700 11px/1 'Space Mono',monospace;letter-spacing:.08em;color:${v.c.ink};text-transform:uppercase;`)}>Auto-start next</span>
                <div onClick={v.toggleAutoCycle} style={css(v.swAuto.track)}><div style={css(v.swAuto.knob)}></div></div>
              </div>
              <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
                <span style={css(`font:700 11px/1 'Space Mono',monospace;letter-spacing:.08em;color:${v.c.ink};text-transform:uppercase;`)}>Chime on finish</span>
                <div onClick={v.toggleSound} style={css(v.swSound.track)}><div style={css(v.swSound.knob)}></div></div>
              </div>
            </div>
          </div>
        )}

      </div>
    )
  }
}
