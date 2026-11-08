# Proyek Grafkom: Sonic, Knuckles, Tails (WebGL 1)

Vanilla JavaScript ES modules, tanpa library. Jalankan lewat local server
(ES modules tidak bisa dibuka lewat `file://`):

```
python -m http.server 8000
```

Lalu buka salah satu halaman:

| Halaman | Isi |
|---|---|
| `sonic-viewer.html` | Sonic + tombol mode transformasi |
| `knuckles-viewer.html` | Knuckles + pose (jalan, lari, tinju, push up, ...) dan mode transformasi |
| `tails-viewer.html` | Tails + idle / jalan / terbang |
| `environment-viewer.html` | Environment Green Hill saja |
| `race-viewer.html` | Ketiga karakter di lintasan. Tombol 1/2/3 = intro karakter, 0 = batal, G = mulai balapan, WASD = geser kamera |

## Struktur folder

```
css/
  viewer.css          tampilan viewer karakter; warna per karakter lewat kelas tema di <html>
  fullscreen.css      canvas layar penuh (environment-viewer, race-viewer)
js/
  core/
    Matrix4.js        operasi matriks 4x4 column-major, lookAt, perspective, rotasi Rodrigues, normal matrix
    MathUtils.js      clamp, smoothStep
    MyObject.js       node scene graph: t, r, s, aa (rotasi sumbu sembarang), parts, children
    Geometry.js       generator mesh: sphere, cone, paraboloid, cylinder, torus, hiperboloid, tabung Bezier, ...
  rendering/
    ShaderProgram.js  compile + link shader, simpan lokasi atribut/uniform per program
    Renderer.js       upload mesh ke GPU, drawMesh (satu mesh), drawTree (seluruh scene graph)
  shaders/            source GLSL tiap karakter + environment (satu objek *_SHADER per file)
  characters/         Sonic.js, Knuckles.js, Tails.js
  environment/        Environment.js (tanah, lintasan, ring, bukit, palem, bunga, awan)
  scenes/             RaceScene.js (balapan), CharacterIntroductionScene.js (intro per karakter)
  app/
    OrbitCamera.js    kamera orbit (drag = putar, scroll = zoom)
    viewerSetup.js    context WebGL, resize canvas, FrameClock, loop, helper tombol
  *-viewer.js         entry point tiap halaman HTML
```