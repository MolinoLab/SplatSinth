# Splats precargados

Coloca aquí archivos `.ply`, `.spz`, `.splat`, `.ksplat` o `.sog` y regístralos en `manifest.json`:

```json
{
  "demos": [
    { "id": "demo-sphere", "name": "Esfera demos", "generator": "sphere" },
    { "id": "demo-grid", "name": "Rejilla demos", "generator": "grid" }
  ],
  "files": [
    { "id": "mi-escena", "name": "Mi escena", "url": "mi-escena.spz" }
  ]
}
```

Las demos `sphere` y `grid` se generan en el navegador (no pesan). Los `files` se sirven estáticamente desde esta carpeta.
