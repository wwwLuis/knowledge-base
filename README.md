<p align="center">
  <img src="static/knowledge-base-logo.png" width="100" alt="Knowledge Base Logo" />
</p>

<h1 align="center">Knowledge Base</h1>

<p align="center">
  <strong>Deine persönliche Desktop-App für Wissen & Notizen.</strong><br/>
  Dokumente verwalten, PDFs lesen, Notizen schreiben und strukturieren — alles offline und an einem Ort.
</p>

<p align="center">
  <img src="[https://img.shields.io/badge/version-1.0.0-6366f1?style=flat-square](https://img.shields.io/badge/version-1.0.0-6366f1?style=flat-square)" alt="Version" />
  <img src="[https://img.shields.io/badge/Tauri-2-24C8D8?style=flat-square&logo=tauri&logoColor=white](https://img.shields.io/badge/Tauri-2-24C8D8?style=flat-square&logo=tauri&logoColor=white)" alt="Tauri" />
  <img src="[https://img.shields.io/badge/Svelte-5-FF3E00?style=flat-square&logo=svelte&logoColor=white](https://img.shields.io/badge/Svelte-5-FF3E00?style=flat-square&logo=svelte&logoColor=white)" alt="Svelte" />
  <img src="[https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)" alt="TypeScript" />
  <img src="[https://img.shields.io/badge/license-MIT-blue?style=flat-square](https://img.shields.io/badge/license-MIT-blue?style=flat-square)" alt="License" />
</p>

---

## Was ist Knowledge Base?

Knowledge Base ist eine leichtgewichtige, performante Desktop-Anwendung, um deine persönlichen Notizen und Dokumente zu verwalten. 

Egal, ob du PDFs lesen und markieren, deine Gedanken in Texten festhalten oder Informationen durch ein intelligentes Tagging-System ordnen möchtest – die App bietet dir alle Werkzeuge für ein effizientes Wissensmanagement.

**Vollständig offline.** Alle Daten, Notizen und Dokumente werden lokal in deiner eigenen Datenbank (`db.ts`) gespeichert. Keine Cloud, kein Tracking, volle Kontrolle.

---

## Kernfunktionen

- 📝 **Integrierter Editor:** Schnelles Schreiben und Formatieren deiner Notizen (`NoteEditor`).
- 📄 **Nativer PDF-Viewer:** PDFs direkt in der App öffnen und lesen (`PdfViewer`).
- 📂 **Flexible Ordnerstruktur:** Organisiere dein Wissen in verschachtelten Verzeichnissen (`FolderTree`).
- 🏷️ **Intelligentes Tagging:** Füge Notizen Tags hinzu und filtere deine Wissensdatenbank blitzschnell (`TagInput` & `TagFilter`).
- 🔦 **Text-Markierungen:** Hebe wichtige Textstellen direkt hervor (`HighlightToolbar`).
- 🎨 **Modernes UI:** Responsives Design mit anpassbarem Theme (Svelte 5 Runes).

---

## Installation & Entwicklung

Stelle sicher, dass du [Node.js](https://nodejs.org/) und die [Rust-Toolchain](https://rustup.rs/) installiert hast (Voraussetzung für Tauri).

1. **Repository klonen**
   ```bash
   git clone https://github.com/dein-username/knowledge-base.git
   cd knowledge-base
   ```

2. **Abhängigkeiten installieren**
   ```bash
   npm install
   ```

3. **Entwicklungsserver starten**
   Dies öffnet die Tauri-Desktop-App im Entwicklungsmodus (inklusive Hot-Reloading).
   ```bash
   npm run tauri dev
   ```

4. **App bauen (Release)**
   Um eine ausführbare Datei für dein Betriebssystem (z.B. `.exe`, `.app`, `.deb`) zu generieren:
   ```bash
   npm run tauri build
   ```

---

## Technologien

- **Frontend:** [Svelte 5](https://svelte.dev/) + TypeScript + Vite
- **Backend/Desktop:** [Tauri 2](https://v2.tauri.app/) (Rust)
- **Datenbank:** Lokale Speicherung (SQLite / IndexedDB)

---

## Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert. Siehe die `LICENSE` Datei für weitere Details.
