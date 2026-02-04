# Virtuelles Verzeichnis Handbuch

## Übersicht

`.VirtualDirectory` ist ein automatisch generiertes virtuelles Verzeichnis dieser Anwendung, das zur Anzeige der Dateistruktur nach intelligenter Organisation verwendet wird. Es behält eine Eins-zu-Eins-Beziehung zu den Dateien im Originalverzeichnis bei, verwendet aber intelligente Benennung.

## Zweck

Der Hauptzweck dieses virtuellen Verzeichnisses ist es, Benutzern zu ermöglichen, die Ergebnisse der Dateiorganisation vorzusehen, ohne die Originaldateien tatsächlich zu verschieben oder zu kopieren.
Wenn Sie mit dem Endergebnis zufrieden sind, können Sie auf "Reales Verzeichnis organisieren" klicken, um das reale Verzeichnis so zu organisieren, dass es der Dateistruktur von .VirtualDirectory entspricht, woraufhin diese Anwendung das .VirtualDirectory-Verzeichnis löscht.

## Technische Prinzipien

### Hard-Link-Technologie

Dateien im virtuellen Verzeichnis werden mithilfe von Hard-Link-Technologie erzeugt. Hard Links können einfach als Referenzen oder Aliase für Dateien verstanden werden und haben folgende Eigenschaften:

1. Kein zusätzlicher physikalischer Speicherplatz wird beansprucht
2. Gemeinsame Nutzung derselben Datenblöcke mit der Originaldatei
3. Änderungen an Hard-Link-Dateien werden mit der Originaldatei synchronisiert
4. Das Löschen einer Hard-Link-Datei beeinflusst die Originaldatei nicht
5. Beim Löschen der Originaldatei ist es notwendig, die Hard-Link-Datei zu löschen (diese Anwendung erkennt aktiv Dateilöschungen im realen Verzeichnis und löscht entsprechend die Hard-Link-Dateien im virtuellen Verzeichnis.)

### Unterschied zu Verknüpfungen

Obwohl Hard Links in gewisser Weise Verknüpfungen ähneln, gibt es wichtige Unterschiede zwischen ihnen:

| Merkmal | Verknüpfungen | Hard Links |
|---------|---------------|------------|
| Dateisystem-Ebene | Nur Windows-Konzept | Betriebssystem-Dateisystem-Funktion |
| Belegter Speicher | Minimal (nur Metadaten) | Kein zusätzlicher Speicher |
| Löschen der Originaldatei | Verknüpfung wird ungültig | Hard Link kann weiterhin auf Dateiinhalt zugreifen |
| Inhaltsänderung | Beeinflusst Originaldatei nicht | Auf alle Links synchronisiert |
| Unterstützung verschiedener Volumes | Unterstützt | Beschränkt auf dasselbe Dateisystem |