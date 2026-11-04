// UI strings, RU + EN. Content strings live in the JSON files as {ru, en}.
import { store } from './store.js';

const DICT = {
  ru: {
    courses: 'Курсы', soon: 'скоро', step: 'Шаг', stepUpper: 'ШАГ', exercise: 'упражнение', exerciseUpper: 'УПРАЖНЕНИЕ',
    improv: 'Импровизация', theory: 'Теория', lesson: 'урок',
    done: 'пройдено', now: 'сейчас', next: 'дальше',
    today: 'СЕГОДНЯ', continue: 'Продолжить', start: 'Начать',
    exercisesDone: 'упражнений', practiceTime: 'за инструментом', bestTempo: 'лучший темп',
    tip: 'Совет', tipText: 'Сначала ритм, потом ноты. Если ритм «поплыл», остановись и отстучи такт ещё раз.',
    back: 'Назад к курсу', theme: 'Сменить тему', language: 'Язык', settings: 'Настройки',
    stRhythm: 'Ритм', stNotes: 'Ноты', stTempo: 'В темпе', stMemory: 'По памяти',
    rhythmSoon: 'Этап «Ритм» появится в следующем обновлении',
    hands: 'Руки', right: 'Правая', left: 'Левая', both: 'Обе',
    listen: 'Послушать', stop: 'Стоп', play: 'Старт', playInTempo: 'Играть в темпе',
    exportPM: 'Piano Marvel', exportPMTitle: 'Скачать MusicXML + MIDI для Piano Marvel',
    prevStep: 'Шаг назад', nextStep: 'Шаг вперёд', slower: 'Медленнее', faster: 'Быстрее',
    straight: 'Ровно', swing: 'Свинг', eighths: 'Восьмые',
    metronome: 'Метроном', countIn: 'Отсчёт 1 такт', noteNames: 'Названия нот', namesOff: 'нет', guideSound: 'Подсказка звучит, пока играю я', pianoSound: 'Звук через пианино (MIDI)',
    legendRh: 'правая', legendLh: 'левая', legendOk: 'верно', legendMeh: 'не вовремя', legendBad: 'не та нота',
    midi: 'MIDI', midiConnect: 'Подключить пианино', midiNone: 'Пианино не подключено', midiUnsupported: 'Нет MIDI в браузере. На iPad открой сайт в MIDIWeb',
    midiDenied: 'Доступ к MIDI не разрешён', midiNotFound: 'Пианино не найдено: включи Bluetooth и нажми ещё раз',
    waitHint: 'Играй подсвеченные ноты: ноты ждут тебя', noMidiHint: 'Нажимай ноты на экране или подключи пианино',
    tempoHint: 'Играй вместе с подсветкой', countInLabel: 'Отсчёт',
    wrongNote: 'не та нота', loopDone: 'круг пройден', allDone: 'Готово!', noErrors: 'без ошибок',
    early: 'рано', late: 'поздно', even: 'ровно', ms: 'мс', result: 'Итог', evenPct: 'ровно',
    stageDone: 'Этап пройден', bar: 'Такт', of: 'из', rest: 'пауза',
    loadError: 'Не удалось загрузить упражнение', notFound: 'Такого упражнения пока нет',
    planned: 'В плане', min: 'мин', h: 'ч'
  },
  en: {
    courses: 'Courses', soon: 'soon', step: 'Step', stepUpper: 'STEP', exercise: 'exercise', exerciseUpper: 'EXERCISE',
    improv: 'Improvisation', theory: 'Theory', lesson: 'lesson',
    done: 'done', now: 'now', next: 'next',
    today: 'TODAY', continue: 'Continue', start: 'Start',
    exercisesDone: 'exercises', practiceTime: 'at the piano', bestTempo: 'best tempo',
    tip: 'Tip', tipText: 'Rhythm first, notes second. If the rhythm drifts, stop and tap the bar again.',
    back: 'Back to course', theme: 'Switch theme', language: 'Language', settings: 'Settings',
    stRhythm: 'Rhythm', stNotes: 'Notes', stTempo: 'In tempo', stMemory: 'By heart',
    rhythmSoon: 'The Rhythm stage arrives in the next update',
    hands: 'Hands', right: 'Right', left: 'Left', both: 'Both',
    listen: 'Listen', stop: 'Stop', play: 'Start', playInTempo: 'Play in tempo',
    exportPM: 'Piano Marvel', exportPMTitle: 'Download MusicXML + MIDI for Piano Marvel',
    prevStep: 'Step back', nextStep: 'Step forward', slower: 'Slower', faster: 'Faster',
    straight: 'Straight', swing: 'Swing', eighths: 'Eighths',
    metronome: 'Metronome', countIn: 'Count-in 1 bar', noteNames: 'Note names', namesOff: 'off', guideSound: 'Guide sounds while I play', pianoSound: 'Sound through the piano (MIDI)',
    legendRh: 'right', legendLh: 'left', legendOk: 'correct', legendMeh: 'off time', legendBad: 'wrong note',
    midi: 'MIDI', midiConnect: 'Connect piano', midiNone: 'Piano not connected', midiUnsupported: 'No MIDI in this browser. On iPad open the site in MIDIWeb',
    midiDenied: 'MIDI access denied', midiNotFound: 'Piano not found: turn on Bluetooth and tap again',
    waitHint: 'Play the highlighted notes: the score waits for you', noMidiHint: 'Tap notes on screen or connect your piano',
    tempoHint: 'Play along with the highlight', countInLabel: 'Count-in',
    wrongNote: 'wrong note', loopDone: 'loop complete', allDone: 'Done!', noErrors: 'no mistakes',
    early: 'early', late: 'late', even: 'on time', ms: 'ms', result: 'Result', evenPct: 'on time',
    stageDone: 'Stage complete', bar: 'Bar', of: 'of', rest: 'rest',
    loadError: 'Could not load the exercise', notFound: 'This exercise is not here yet',
    planned: 'Planned', min: 'min', h: 'h'
  }
};

let lang = store.get('lang', null) || ((navigator.language || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en');

export const getLang = () => lang;
export function setLang(l) { lang = l === 'en' ? 'en' : 'ru'; store.set('lang', lang); document.documentElement.lang = lang; }
export const t = (key) => (DICT[lang] && DICT[lang][key]) || DICT.ru[key] || key;
/** Pick a localized content string: {ru, en} or plain string. */
export const L = (v) => (v && typeof v === 'object' ? v[lang] || v.ru || v.en || '' : v || '');
document.documentElement.lang = lang;
