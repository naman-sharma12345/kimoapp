# Motion, zooms and transitions

## Default to the hard cut

90% of great edits are hard cuts. Use transitions to say something: a dip-to-black for time passing or a mood shift, crossfade for dreamy montage, slide for a list or reveal, zoom-in for an energetic reveal. Never mix more than two transition types in one video.

## Punch-ins and zooms

- Punch-in on emphasis: scale 1.0 to 1.15-1.25 for a whole segment (static), re-centre on the subject.
- zoom_punch effect: quick hit on a beat or a key word; use it at most every 5 to 10 s.
- Slow push (Ken Burns): keyframe scale 1.0 to 1.08 over the whole clip, ease-in-out. Great on photos and static B-roll; keep the subject inside frame.
- Snap zoom to a detail: scale 1.0 to 1.6 over 0.2 s, ease-out, hold, then cut.

## Keyframes

- Always ease (ease-out for things arriving, ease-in for leaving, ease-in-out for moves). Linear only for constant drifts.
- Short: 0.15 to 0.4 s for snappy UI-like moves; 2 to 6 s for cinematic drifts.
- Keep transforms on-canvas: with scale s, |x| and |y| offsets must stay within (s-1)/2 of the frame so no black edges show.

## B-roll

- Lay B-roll on the overlay track while the A-roll audio continues. 1.5 to 4 s per B-roll shot in shorts, 3 to 8 s in long-form.
- Cut B-roll in on a word that names the thing.
