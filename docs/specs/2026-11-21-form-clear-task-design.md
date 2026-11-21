# Form screen: a clear task (2026-11-21)

## Why

The user sits down at a form exercise (`#/t/<track>/form-*`, `app/js/screens/form.js`) and does not know what to press
or where to look. Observed causes:

- No task statement: nothing says which hand plays, which notes, on which beats, and what counts as passed.
- The notes of a bar are a 12 px line under the chord name, hidden on a phone.
- A key lights at the moment it is already due; the next note is only a thin underline.
- The count-in shows a number, not where to put the hand.
- There is no step without tempo (the lick screen has one since PR 53).

## Goals

- Before Start the screen says in plain words what to do and how it is passed.
- While playing, one glance tells: the chord now, the notes of this bar on their beats, what comes next.
- The keyboard shows the hand position of the bar ahead of time.
- A first stage without tempo teaches the notes of the form before the drums start.
- Works for every form item: left-hand pattern, right-hand lick, question and answer, key-relative licks, melody,
  both hands, comping; blues, bossa, standards; desktop and phone.

Non-goals: new content, changes to scoring rules, changes to the solo and performance screens (they share `.fgrid` CSS
and must not move).

## Approaches

1. Explain only (a help text). Cheap, but the late key hint and the hidden notes stay.
2. **Redesign the form screen in place, in two PRs (chosen).** Same screen and data, new presentation, then a stage.
3. Replace the form with the notation exercise screen. The user avoids the staff; loses the 12-bar overview.

## Design

### PR 1: a clear screen

- **Task block** (shown while stopped): a headline for the mode (which hand, what the band plays), the pattern /
  lick / tune description, and the pass rule («3 clean choruses in a row, N slips allowed per chorus»).
- **Now / next strip** (always shown): the current bar's chord, large; a 1-2-3-4 row with the notes of the bar under
  their beats (one row per hand that is yours, with fingers); the next bar's chord and its notes. A bar with nothing
  to play says «rest». Stopped, the strip shows bar 1 as «first bar».
- **Keyboard**: every key of the shown bar is tinted with its finger for the whole bar; the note to press next is
  strong. The strong key moves on when the note is hit or its window passes. After the last note of a bar the
  keyboard already shows the next bar. During the count-in it shows bar 1.
- The 12-bar grid stays as the map (current bar framed, results coloured).
- Pure logic goes to `app/js/music/formview.js` with a node test.

### PR 2: stage «Notes» without tempo

- Two stages in the header, as on the lick screen: 1 «Notes», 2 «In tempo».
- Notes: no drums, no clock. The key to press is lit; the right key moves on, a wrong key says where the right one is
  (`keyHint` from `music/lickfb.js`). One whole form without a wrong key passes the stage.
- In tempo: today's behaviour. `stages.done`, `choruses`, `cleanChoruses`, `bestStreak` keep their meaning; an item
  already passed has both stages ticked. The «In tempo» stage is never locked.

## Left to the builder

Exact layout, class names, wording of the secondary lines. All strings in `ru` and `en`.
