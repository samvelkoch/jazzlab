# jazzlab

Клавиатура-подсказка для упражнений из джазовой школы фортепиано.

Live: https://samvelkoch.github.io/jazzlab/

- `src/piano-guide.html` — исходник (тот же, что в Artifact).
- `index.html` — собирается `scripts/build.sh` (добавляет doctype/charset/viewport).

## Экспорт для Piano Marvel

`python3 scripts/export_ex2.py` → `exports/week1-ex2.musicxml` + `exports/week1-ex2.mid`
(неделя 1, упражнение 2: одна партия, 2 нотоносца — RH/LH, ровные восьмые, ♩=90; XML и MIDI собраны из одних данных, ноты совпадают 1:1).
