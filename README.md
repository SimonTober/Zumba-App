# Zumba Planer

Persönliche Kursassistentin für Zumba-Stunden. Eine statische Web-App (PWA), installierbar wie eine App und offline nutzbar. Kein Build, kein Server, kein Konto.

## Funktionen

- **Stunde planen**: 30 / 45 / 55 / 60 Minuten, Intensität (Gemischt, Sanft, Mittel, Power), Favoriten und Trends bevorzugen. Mischt automatisch mit Abwechslung zu den letzten Stunden. Mit Intensitätsverlauf.
- **Anpassen**: Übungen tauschen, hinzufügen und entfernen (mit „Rückgängig“), Song pro Phase wechseln, Notizen.
- **Kursmodus**: Timer mit Ring, 3-2-1-Countdown, Beat-Zähler 1–8 mit Klick und mitlaufender Schrittanleitung, Sprachansagen, Trinkpausen, „Groß“-Modus für den Raum, Vollbild, Wischen und Pfeiltasten, Bildschirm bleibt an. Holt die Zeit nach, wenn Du kurz in Spotify warst.
- **Musik**: über 300 Songs mit Spotify- und YouTube-Links. Spotify-Playlists pro Phase lassen sich direkt einbetten.
- **Abschluss**: Bewertung, Teilnehmerzahl, Notizen, Konfetti.
- **Übungen**: 47 Übungen mit Anleitung, Tipp und Video-Suche. Filter nach Phase, Trend, Favoriten und Rhythmus.
- **Choreo-Baukasten**: Schritte in 8er-Blöcken, als Schleife im Beat, Zufalls-Choreo, speichern.
- **Fortschritt**: Wochenziel, Serien, Minuten pro Woche, Abzeichen, Ø Bewertung und Teilnehmende, Kalorien-Schätzung, Verlauf.
- **Teilen & Sichern**: Stunde per Link teilen, Vorlagen, Backup als Datei (Export und Import), Drucken als PDF.
- Hell, Dunkel oder automatisch. Barrierearm (axe-core ohne Befund), respektiert „Bewegung reduzieren“.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Gerüst, Icons (SVG-Sprite), Sicherheitsregeln (CSP) |
| `css/app.css` | Design mit Farb-Tokens für Hell und Dunkel |
| `js/data.js` | Inhalte: Übungen, Songs, Tipps – hier neue Inhalte eintragen |
| `js/app.js` | App-Logik |
| `sw.js` | Offline-Cache. **Bei jeder Änderung `CACHE` hochzählen** (z. B. `zumba-v8`) |
| `tests/smoke.js` | Durchgängiger Browser-Test |

## Lokal starten und testen

```bash
python3 -m http.server       # dann http://localhost:8000 öffnen
node tests/smoke.js          # braucht Playwright mit Chromium
SHOTS=ordner node tests/smoke.js   # zusätzlich Screenshots speichern
```

## Sicherheit und Datenschutz

- Alle Daten bleiben im Browser (localStorage). Kein Tracking.
- Strenge Content-Security-Policy: nur eigene Skripte, keine Inline-Handler, Frames nur von Spotify.
- Gespeicherte Daten, geteilte Links und Backups werden geprüft. Es werden nur bekannte Übungen und Songs übernommen, alle Texte werden escaped.

## Hinweise

- BPM-Werte sind Schätzungen aus der Tempo-Angabe der Songliste („ruhig“ ≈ 80 … „sehr schnell“ ≈ 135). Im Kursmodus mit ± anpassbar.
- Kalorien sind grob geschätzt (Zumba ≈ 6,5 MET, Gewicht unter „Mehr“).
- Vollbild gibt es auf dem iPhone im Browser nicht.
