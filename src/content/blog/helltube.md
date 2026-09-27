---
title: Helltube: keeping a room in sync
date: 2026-09-27
summary: Shared video, live desktops, and the state management behind watching something together.
tags: Helltube, Svelte, Real-time systems
readingTime: 2 min read
---

Helltube is my watch-together app, built with Svelte and Node.js. People join a room, add videos to a shared queue, and control playback together. It also supports desktop sharing, shared files, and reactions drawn directly over the picture. Behind that fairly casual interface is a specific engineering problem: every browser needs to agree on what the room is doing while still handling its own connection and playback quirks.

Each room has one authoritative playback clock on the server. Its state includes a position, a timestamp, whether playback is paused, and a revision. Clients estimate their offset from the server clock and use that state to work out where the video should be now. Small differences can be corrected with a slight playback-speed adjustment; larger differences require a seek. A late joiner gets the current room state and catches up from there.

Video preparation is part of that model. The backend uses tools including yt-dlp and FFmpeg to prepare shared HLS media, so playback can begin before a whole source video has downloaded. The room timeline waits for media readiness. Meanwhile, an individual viewer's volume, autoplay restrictions, or recovery from a delivery problem belong to that browser. A local recovery should not unexpectedly move the timeline for everybody else.

Desktop sharing has different requirements. It uses WebRTC through a mediasoup relay: the sharer sends one encoded stream to the server, which forwards it to viewers. That keeps the sharer's upload from multiplying with the audience, although the server still needs outbound bandwidth for each viewer. Live desktops do not have a seekable timeline. When someone starts sharing, the interrupted video keeps its place in the queue; videos and live shares can also coexist, with desktops appearing as thumbnails while a video plays.

The room has a playful side, too. The whiteboard sends drawing coordinates as people sketch over the player, and late joiners receive the current board. Shared files have their own persistent storage and resumable uploads. Those features need different lifetimes: a drawing can disappear when a room empties, while an uploaded file should survive a server restart. Even frontend updates account for that distinction, waiting while a browser still holds unfinished upload files or an active screen share.

Helltube brings those systems together around a room people can spend time in. The queue, playback clock, live streams, and temporary reactions each have their own rules, but the interface has to make them feel coherent. I also embed Helltube in [Strife](/blog/strife), alongside native Mumble voice and chat.
