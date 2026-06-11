# 👻 Dependency Ghost – Autonomous Dependency Behavior Patcher

**A 3‑agent autonomous system that detects and fixes silent dependency breakages – built entirely on a phone, zero cost.**

[![Hackathon](https://img.shields.io/badge/FAR%20AWAY-2026-blue)](https://faraway.in)
[![Made with AI](https://img.shields.io/badge/Built%20with-AI%20tools-brightgreen)](https://replit.com)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 🚨 The Problem

When you update an npm library (e.g., lodash, axios), the new version might **silently change how a function behaves** – even if the version number changes only slightly. Existing tools like **Dependabot** and **Snyk** only check for **security vulnerabilities**, not **behavioral mismatches**.

Result? Your production app breaks without warning. This has cost companies millions of dollars (e.g., `colors.js` incident 2025).

---

## 💡 Our Solution – Dependency Ghost

A fully autonomous **3‑agent loop** that:

| Agent | Role | Technology |
|-------|------|-------------|
| **THINK** | Reads `package.json` and maps expected function contracts (what each function should return) | Gemini API (free tier) |
| **EXECUTE** | Runs the new dependency in a sandbox (GitHub Actions) and records actual behavior | GitHub Actions (free) |
| **SELF‑CORRECT** | Compares expected vs actual; if mismatch found, generates a compatibility wrapper (patch), re‑tests, and opens a Pull Request | Gemini API + GitHub API |

**No human intervention. No expensive servers. Built entirely on a phone.**

---

## 🎯 Key Features

- ✅ **3‑agent autonomous loop** – Think → Execute → Self‑Correct → Verify  
- ✅ **Real‑time visualizer** – Glowing agent cards with streaming logs  
- ✅ **Webhook notifications** – Slack / Discord alerts on scan completion or failure  
- ✅ **QR code sharing** – Instant scan result links  
- ✅ **Retry logic** – Handles API overload gracefully (exponential backoff)  

---

## 🛠️ Tech Stack (All Free)

| Component | Technology |
|-----------|------------|
| AI for contracts & patches | **Gemini API** (free tier) |
| Sandbox testing | **GitHub Actions** |
| Backend / agents | **TypeScript / Python** |
| Development & hosting | **Replit + GitHub** |

**💰 Total cost: ₹0** – no credit card required for any service.

---

## 🚀 How to Use (for judges)

1. **Open the live app** (if still running): [https://code-behavior-guard--anshukumar2686.replit.app/]  
2. **Paste a GitHub repo URL** that has a `package.json` (e.g., `https://github.com/axios/axios`)  
3. Click **INITIATE SCAN**  
4. Watch the 3 agents run in real time (or view past scans in **RECENT SCANS**)  

> **Note:** The free Gemini API may sometimes be overloaded (503 error). The app has built‑in retry logic (3 attempts with exponential backoff). A successful scan from `axios/axios` is shown in the demo screenshots above.

---

## 📊 Why This Is Different

| Other Tools | Dependency Ghost |
|-------------|------------------|
| Only check CVEs | Checks **behavioral changes** |
| Give suggestions | **Auto‑generates & tests patches** |
| Single AI call | True **3‑agent autonomous loop** |
| Need laptop / paid APIs | **Phone‑built, zero cost** |

---

## 🏆 Hackathon Submission

- **Event:** FAR AWAY 2026 – India's Biggest International Hackathon  
- **Theme:** Agentic & Autonomous Systems  
- **Team:** [Horizon Seekers] – first hackathon
- **Team Member:** Priyanshu Kumar, Krish Kumar Verma 

---

## 🔮 Future Improvements

- Support Python (PyPI) and Ruby (RubyGems)  
- Parallel scanning for multiple repos  
- Real‑time health dashboard with trend charts  
- One‑click deploy of fixed repo to Vercel/Netlify  

---

## 📄 License

MIT – free for everyone to use and improve.

---

## 🙏 Thank You, Judges

Built in 48 hours, on a phone, with free AI tools.  
**This is true agentic autonomy at zero cost.**

---

## 🔗 Links

- **GitHub Repository:** [github.com/priyanshu098-tech/Code-Behavior-Guard](https://github.com/priyanshu098-tech/Code-Behavior-Guard)  
- **Live App:** *(https://d249c1cb-9237-4bd5-89b6-62a366fb7b82-00-2w9i3iu83gufb.sisko.replit.dev/)*  

---

*Made with ❤️ for FAR AWAY 2026*
