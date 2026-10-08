import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Clock3,
  Copy,
  ExternalLink,
  Flame,
  LayoutDashboard,
  MessageSquare,
  MonitorPlay,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import { useApp } from "./stores/app.js";
import { connectSocket } from "./services/socket.js";
import { formatMs, timerSeverity } from "./utils/time.js";
import type { Device, Timer, Room } from "./types/index.js";

const api = window.stageflow;

export function App() {
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode");
  const roomParam = params.get("room");
  if (mode && roomParam) return <Output mode={mode} roomId={roomParam} />;
  return <Controller />;
}

function Controller() {
  const {
    room,
    timers,
    messages,
    setRoom,
    setTimers,
    setMessages,
    selectedTimerId,
    select,
  } = useApp();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [server, setServer] = useState<{
    ip: string;
    port: number;
    url: string;
    connections: number;
  }>();
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [roomCreateOpen, setRoomCreateOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomCreateError, setRoomCreateError] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [message, setMessage] = useState("");
  const [editTimerId, setEditTimerId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Timer>>({});
  const [settingsDraft, setSettingsDraft] = useState<Room | null>(null);
  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const [activePage, setActivePage] = useState<
    "controller" | "timers" | "outputs" | "agenda" | "messages" | "connections" | "settings"
  >("controller");

  useEffect(() => {
    if (!api) {
      setError("The controller requires the FaithCity Stageflow desktop app.");
      setReady(true);
      return;
    }
    let mounted = true;
    Promise.all([api.rooms.list(), api.server.info()])
      .then(([loadedRooms, serverInfo]: [Room[], typeof server]) => {
        if (!mounted) return;
        setRooms(loadedRooms);
        setServer(serverInfo);
        const activeRoom = loadedRooms.find((item) => item.id === room?.id) ?? loadedRooms[0];
        if (activeRoom) setRoom(activeRoom);
      })
      .catch((reason: unknown) => {
        if (mounted) {
          setInitialLoadFailed(true);
          setError(`Unable to load the local workspace: ${errorMessage(reason)}`);
        }
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!room || !api || !server) return;
    let mounted = true;
    setTimers([]);
    setMessages([]);
    setDevices([]);
    Promise.all([api.timers.list(room.id), api.messages.list(room.id)])
      .then(([loadedTimers, loadedMessages]: [Timer[], typeof messages]) => {
        if (mounted) {
          setTimers(loadedTimers);
          setMessages(loadedMessages);
        }
      })
      .catch((reason: unknown) => {
        if (mounted) setError(`Unable to load room data: ${errorMessage(reason)}`);
      });
    const s = connectSocket(room.id, "controller", "FaithCity Stageflow Controller", server.port);
    socketRef.current = s;
    s.on("state", (state: any) => {
      if (!mounted) return;
      setRoom(state.room);
      setTimers(state.timers);
      setMessages(state.messages);
      setError("");
    });
    s.on("connections", (connectedDevices) => {
      if (mounted) setDevices(connectedDevices);
    });
    s.on("connect_error", (reason) => setError(`Connection lost: ${reason.message}`));
    s.on("connect", () => setError(""));
    return () => {
      mounted = false;
      if (socketRef.current === s) socketRef.current = null;
      s.disconnect();
    };
  }, [room?.id, server?.port]);
  useEffect(() => {
    setSettingsDraft(room);
  }, [room]);

  const selected = timers.find((t) => t.id === selectedTimerId) || timers[0];
  const viewerUrl = server && room
    ? `${server.url.replace(/\/$/, "")}/viewer/${encodeURIComponent(room.id)}`
    : "";
  const act = (type: string, timerId?: string, extra: any = {}) => {
    if (!socketRef.current?.connected) {
      setError("The local server is not connected. Reconnect before sending controls.");
      return false;
    }
    socketRef.current.emit("action", { type, timerId, ...extra });
    return true;
  };
  useEffect(() => {
    if (activePage !== "controller") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)
      )) return;
      const key = event.key.toLowerCase();
      if (key === " " && selected) {
        event.preventDefault();
        act(selected.status === "running" ? "pause" : "start", selected.id);
      } else if (key === "r" && selected) {
        act("reset", selected.id);
      } else if (key === "f" && selected) {
        act("flash", selected.id);
      } else if (key === "n" && selected) {
        const index = timers.findIndex((timer) => timer.id === selected.id);
        const next = timers[index + 1];
        if (next) {
          select(next.id);
          act("advance", selected.id);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePage, selected?.id, selected?.status, timers, room?.id]);
  const add = async () => {
    if (!room || !api || !socketRef.current?.connected) {
      setError("Connect to the local server before creating a timer.");
      return;
    }
    try {
      const created = await api.timers.create(room.id, {
        title: "New Timer",
        durationMs: 300000,
      });
      if (!act("upsert", created.id, { timer: created })) return;
      setTimers([...timers, created]);
      select(created.id);
      setError("");
    } catch (reason) {
      setError(`Unable to create timer: ${errorMessage(reason)}`);
    }
  };
  const removeTimer = (timer: Timer) => {
    if (!act("delete", timer.id)) return;
    const index = timers.findIndex((item) => item.id === timer.id);
    const remaining = timers.filter((item) => item.id !== timer.id);
    setTimers(remaining);
    if (selectedTimerId === timer.id) {
      select(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
    }
    if (editTimerId === timer.id) {
      setEditTimerId(null);
      setEditDraft({});
    }
  };
  const startEdit = (timer: Timer) => {
    setEditTimerId(timer.id);
    setEditDraft({ ...timer });
  };
  const saveEdit = async () => {
    if (!selected || !room || !api || !socketRef.current?.connected) {
      setError("Connect to the local server before saving timer changes.");
      return;
    }
    const draft = { ...selected, ...editDraft };
    const durationMs = Math.max(
      0,
      Number(draft.durationMs ?? selected.durationMs),
    );
    const updated: Timer = {
      ...draft,
      title: String(draft.title ?? selected.title).trim() || "Untitled Timer",
      speaker: String(draft.speaker ?? selected.speaker),
      notes: String(draft.notes ?? selected.notes),
      durationMs,
      warningSeconds: Number(draft.warningSeconds ?? selected.warningSeconds),
      criticalSeconds: Number(
        draft.criticalSeconds ?? selected.criticalSeconds,
      ),
      remainingMs:
        selected.status === "idle"
          ? durationMs
          : Math.max(0, selected.remainingMs),
    };
    try {
      await api.timers.update(updated);
      if (!act("upsert", updated.id, { timer: updated })) return;
      setTimers(timers.map((t) => (t.id === updated.id ? updated : t)));
      setEditTimerId(null);
      setEditDraft({});
      setError("");
    } catch (reason) {
      setError(`Unable to save timer: ${errorMessage(reason)}`);
    }
  };
  const cancelEdit = () => {
    setEditTimerId(null);
    setEditDraft({});
  };
  const addRoom = async () => {
    const name = roomName.trim();
    if (!name) {
      setRoomCreateError("Enter a name for the new room.");
      return;
    }
    if (!api) {
      setRoomCreateError("Room creation is only available in the desktop app.");
      return;
    }
    setCreatingRoom(true);
    setRoomCreateError("");
    try {
      const created = await api.rooms.create(name);
      setRooms((current) => [created, ...current]);
      if (!room) {
        setRoom(created);
        select(null);
      }
      setRoomName("");
      setRoomCreateOpen(false);
      setError("");
    } catch (reason) {
      setRoomCreateError(`Unable to create room: ${errorMessage(reason)}`);
    } finally {
      setCreatingRoom(false);
    }
  };
  const openRoomCreation = () => {
    setRoomName("");
    setRoomCreateError("");
    setRoomCreateOpen(true);
  };
  const deleteActiveRoom = async () => {
    if (!room || !api) return;
    if (!window.confirm(`Delete "${room.name}" and all of its timers and messages? This cannot be undone.`)) {
      return;
    }
    try {
      await api.rooms.delete(room.id);
      const remainingRooms = rooms.filter((item) => item.id !== room.id);
      setRooms(remainingRooms);
      setRoom(remainingRooms[0] ?? null);
      setTimers([]);
      setMessages([]);
      setDevices([]);
      select(null);
      setEditTimerId(null);
      setEditDraft({});
      setError("");
    } catch (reason) {
      setError(`Unable to delete room: ${errorMessage(reason)}`);
    }
  };
  const saveSettings = async () => {
    if (!settingsDraft || !api || !socketRef.current?.connected) {
      setError("Connect to the local server before saving room settings.");
      return;
    }
    if (!settingsDraft.name.trim()) {
      setError("Room name cannot be empty.");
      return;
    }
    const updated = { ...settingsDraft, updatedAt: new Date().toISOString() };
    try {
      await api.rooms.update(updated);
      if (!act("roomUpdate", undefined, { room: updated })) return;
      setRoom(updated);
      setRooms((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSettingsDraft(updated);
      setError("");
    } catch (reason) {
      setError(`Unable to save room settings: ${errorMessage(reason)}`);
    }
  };
  const openOutput = async (mode: "viewer" | "agenda" | "moderator") => {
    if (!room || !api) return;
    try {
      await api.windows[mode](room.id);
    } catch (reason) {
      setError(`Unable to open ${mode}: ${errorMessage(reason)}`);
    }
  };
  const roomCreateDialog = roomCreateOpen && (
    <div className="dialogBackdrop">
      <form
        className="roomDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-room-title"
        onSubmit={(event) => {
          event.preventDefault();
          void addRoom();
        }}
      >
        <div>
          <h2 id="create-room-title">Create room</h2>
          <p>Give this event room a name. You can activate it from the room selector.</p>
        </div>
        <label>
          <span>Room name</span>
          <input
            autoFocus
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            placeholder="e.g. Sunday Service"
            maxLength={100}
          />
        </label>
        {roomCreateError && <div className="errorBanner" role="alert">{roomCreateError}</div>}
        <div className="editActions">
          <button
            className="ghost"
            type="button"
            disabled={creatingRoom}
            onClick={() => setRoomCreateOpen(false)}
          >
            Cancel
          </button>
          <button className="primary" type="submit" disabled={creatingRoom || !roomName.trim()}>
            <Plus size={15} /> {creatingRoom ? "Creating…" : "Create room"}
          </button>
        </div>
      </form>
    </div>
  );

  if (!ready) return <div className="loading">Loading FaithCity Stageflow…</div>;
  if (!api) {
    return (
      <main className="emptyStatePage">
        <h1>Desktop app required</h1>
        <p>The controller is available inside the FaithCity Stageflow desktop application.</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  }
  if (!room) {
    return (
      <main className="emptyStatePage">
        <img className="setupLogo" src="./faithcity-logo.png" alt="Faith City Lagos Province 5 HQ" />
        <h1>{initialLoadFailed ? "Workspace unavailable" : "Create your first room"}</h1>
        <p>{initialLoadFailed ? "The local workspace could not be loaded. Resolve the error and retry." : "No event rooms are configured yet. Create a room to start building its timer rundown."}</p>
        {error && <p className="errorBanner" role="alert">{error}</p>}
        {initialLoadFailed
          ? <button className="primary" onClick={() => window.location.reload()}>Retry</button>
          : <button className="primary" onClick={openRoomCreation}><Plus size={16} /> Create room</button>}
        {roomCreateDialog}
      </main>
    );
  }

  const currentRoom = room;
  const showControllerPage = activePage === "controller";
  const pageTitles: Record<typeof activePage, string> = {
    controller: currentRoom.name || "Controller",
    timers: "Timers",
    outputs: "Outputs",
    agenda: "Agenda",
    messages: "Messages",
    connections: "Connections",
    settings: "Settings",
  };
  const agendaCurrentIndex = timers.findIndex(
    (timer) => timer.status === "running" || timer.status === "paused",
  );
  const agendaSelectedIndex = agendaCurrentIndex >= 0
    ? agendaCurrentIndex
    : timers.findIndex((timer) => timer.id === selected?.id);

  const renderPage = () => {
    if (activePage === "timers") {
      return (
        <section className="workspace">
          <div className="rundownPanel">
            <div className="panelHead">
              <div>
                <h2>Timer library</h2>
                <span>{timers.length} segments configured</span>
              </div>
              <button className="iconBtn" onClick={add}>
                <Plus size={17} />
              </button>
            </div>
            <div className="timerList">
              {timers.map((t, i) => (
                <TimerRow
                  key={t.id}
                  timer={t}
                  index={i}
                  selected={selected?.id === t.id}
                  onSelect={() => select(t.id)}
                  onAction={act}
                  onEdit={() => startEdit(t)}
                  onDelete={() => removeTimer(t)}
                />
              ))}
              {timers.length === 0 && <div className="emptyState">No timers in this room yet. Add a timer to begin the rundown.</div>}
            </div>
          </div>
          <div className="controlPanel">
            <div className="liveCard">
              <div className="liveMeta">
                <span className={`pill ${selected?.status === "running" ? "live" : ""}`}>
                  {selected?.status === "finished" ? "TIME UP !!!" : selected?.status?.toUpperCase() || "IDLE"}
                </span>
                <span>{selected?.speaker || "No speaker assigned"}</span>
              </div>
              <div className="bigTimer">
                {selected ? <LiveTime timer={selected} /> : <span>--:--</span>}
              </div>
              <div className="timerTitle">
                {selected?.title || "Select a timer"}
              </div>
              <div className="transport">
                <button className="danger" onClick={() => selected && act("reset", selected.id)}>
                  <RotateCcw />
                </button>
                <button className="mainPlay" onClick={() => selected && act(selected.status === "running" ? "pause" : "start", selected.id)}>
                  {selected?.status === "running" ? <Pause /> : <Play />}
                </button>
              </div>
            </div>
            {selected && editTimerId === selected.id && (
              <div className="editCard">
                <div className="panelHead">
                  <div>
                    <h3>Edit timer</h3>
                    <span>Update the selected segment</span>
                  </div>
                </div>
                <div className="editGrid">
                  <label>
                    <span>Title</span>
                    <input
                      value={String(editDraft.title ?? selected.title)}
                      onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Speaker</span>
                    <input
                      value={String(editDraft.speaker ?? selected.speaker)}
                      onChange={(e) => setEditDraft((d) => ({ ...d, speaker: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Duration (ms)</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={Number(editDraft.durationMs ?? selected.durationMs)}
                      onChange={(e) => setEditDraft((d) => ({ ...d, durationMs: Number(e.target.value) }))}
                    />
                  </label>
                  <label>
                    <span>Warning at (seconds)</span>
                    <input
                      type="number"
                      min="0"
                      value={Number(editDraft.warningSeconds ?? selected.warningSeconds)}
                      onChange={(e) => setEditDraft((d) => ({ ...d, warningSeconds: Math.max(0, Number(e.target.value)) }))}
                    />
                  </label>
                  <label>
                    <span>Critical at (seconds)</span>
                    <input
                      type="number"
                      min="0"
                      value={Number(editDraft.criticalSeconds ?? selected.criticalSeconds)}
                      onChange={(e) => setEditDraft((d) => ({ ...d, criticalSeconds: Math.max(0, Number(e.target.value)) }))}
                    />
                  </label>
                  <label className="wide">
                    <span>Notes</span>
                    <textarea
                      value={String(editDraft.notes ?? selected.notes)}
                      onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="editActions">
                  <button className="ghost" onClick={cancelEdit}>Cancel</button>
                  <button className="primary" onClick={saveEdit}>Save</button>
                </div>
              </div>
            )}
          </div>
        </section>
      );
    }

    if (activePage === "outputs") {
      return (
        <section className="workspace">
          <div className="rundownPanel">
            <div className="panelHead">
              <div>
                <h2>Output screens</h2>
                <span>Viewer, agenda, and moderator views</span>
              </div>
            </div>
            <div className="timerList">
              {[
                { name: "Viewer", mode: "viewer" as const, icon: <MonitorPlay size={16} />, description: "Main live display" },
                { name: "Agenda", mode: "agenda" as const, icon: <CalendarClock size={16} />, description: "Stage schedule" },
                { name: "Moderator", mode: "moderator" as const, icon: <LayoutDashboard size={16} />, description: "Operator overview" },
              ].map((output) => (
                <div className="timerRow" key={output.mode} onClick={() => openOutput(output.mode)}>
                  <div className="drag">•</div>
                  <div className="index">{output.name.slice(0, 2).toUpperCase()}</div>
                  <div className="stripe" style={{ background: "#2563eb" }} />
                  <div className="timerInfo">
                    <strong>{output.name}</strong>
                    <span>{output.description}</span>
                  </div>
                  <div className="rowTime">{devices.some((device) => device.role === output.mode) ? "Connected" : "Not open"}</div>
                  <button className="rowPlay" aria-label={`Open ${output.name}`} onClick={(e) => { e.stopPropagation(); openOutput(output.mode); }}>
                    {output.icon}
                  </button>
                  <button className="more" title={`Open ${output.name}`} onClick={(e) => { e.stopPropagation(); openOutput(output.mode); }}>
                    <ExternalLink size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="controlPanel">
            <div className="liveCard">
              <div className="liveMeta">
                <span className={`pill ${selected?.status === "running" ? "live" : ""}`}>{selected?.status?.toUpperCase() || "IDLE"}</span>
                <span>{currentRoom.name}</span>
              </div>
              <div className="bigTimer">{selected ? <LiveTime timer={selected} /> : <span>--:--</span>}</div>
              <div className="timerTitle">{selected?.title || "Select a timer"}</div>
              <div className="transport">
                <button className="primary" onClick={() => openOutput("viewer")}><ExternalLink size={16} /> Open viewer</button>
                <button className="ghost" onClick={() => openOutput("agenda")}><CalendarClock size={16} /> Agenda</button>
              </div>
            </div>
            <div className="messageCard">
              <div className="panelHead">
                <div>
                  <h3>Display status</h3>
                  <span>Connected outputs</span>
                </div>
              </div>
              <div className="activeMessage" style={{ margin: "12px" }}>
                <span>{devices.filter((device) => device.role !== "controller").length} connected output(s)</span>
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (activePage === "agenda") {
      return (
        <div className="agenda">
          <div className="outputBrand">FAITHCITY STAGEFLOW · AGENDA</div>
          <h1>{currentRoom.name}</h1>
          <div className="agendaGrid">
            {timers.map((t: Timer, i: number) => (
              <div className={`agendaItem ${selected?.id === t.id ? "current" : ""}`} key={t.id}>
                <div>
                  <small>{i === agendaSelectedIndex ? "NOW" : i === agendaSelectedIndex + 1 ? "NEXT" : "UPCOMING"}</small>
                  <strong>{t.title}</strong>
                  <span>{t.speaker || "—"}</span>
                </div>
                <time>{formatMs(t.durationMs)}</time>
              </div>
            ))}
            {timers.length === 0 && <div className="emptyState">No agenda items yet. Add timers to build this room’s schedule.</div>}
          </div>
        </div>
      );
    }

    if (activePage === "messages") {
      return (
        <section className="workspace">
          <div className="rundownPanel">
            <div className="panelHead">
              <div>
                <h2>Message queue</h2>
                <span>{messages.filter((m) => m.active).length} active message(s)</span>
              </div>
            </div>
            <div className="timerList">
              {messages.map((m) => (
                <div className="timerRow" key={m.id}>
                  <div className="drag">•</div>
                  <div className="index">{m.active ? "ON" : "OFF"}</div>
                  <div className="stripe" style={{ background: m.active ? "#22c55e" : "#475569" }} />
                  <div className="timerInfo">
                    <strong>{m.text || "Untitled message"}</strong>
                    <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="rowTime">{m.flash ? "Flash" : "Static"}</div>
                  <button className="rowPlay" onClick={() => act("clearMessage")}> <X size={15} /> </button>
                  <button className="more" title="Clear" onClick={() => act("clearMessage")}> <Trash2 size={15} /> </button>
                </div>
              ))}
                  {messages.length === 0 && <div className="emptyState">No presenter messages have been sent in this room.</div>}
            </div>
          </div>
          <div className="controlPanel">
            <div className="messageCard">
              <div className="panelHead">
                <div>
                  <h3>Presenter message</h3>
                  <span>Synced instantly to outputs</span>
                </div>
                <MessageSquare size={18} />
              </div>
              <div className="messageInput">
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a cue for the stage…"
                />
                <button
                  onClick={() => {
                    if (message.trim()) {
                      if (act("message", undefined, { text: message, flash: false })) setMessage("");
                    }
                  }}
                >
                  Send
                </button>
              </div>
              {messages.filter((m) => m.active).map((m) => (
                <div className="activeMessage" key={m.id}>
                  <span>{m.text}</span>
                  <button onClick={() => act("clearMessage")}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (activePage === "connections") {
      return (
        <section className="workspace">
          <div className="rundownPanel">
            <div className="panelHead">
              <div>
                <h2>Connected devices</h2>
                <span>Current network status</span>
              </div>
            </div>
            <div className="timerList">
              {devices.map((item) => (
                <div className="timerRow" key={item.id}>
                  <div className="drag">•</div>
                  <div className="index">{item.role.slice(0, 2).toUpperCase()}</div>
                  <div className="stripe" style={{ background: "#10b981" }} />
                  <div className="timerInfo">
                    <strong>{item.name}</strong>
                    <span>{item.ip}</span>
                  </div>
                  <div className="rowTime">Connected</div>
                  <button className="rowPlay" onClick={() => navigator.clipboard?.writeText(item.ip)}><Copy size={15} /></button>
                  <button className="more" title="Copy IP" onClick={() => navigator.clipboard?.writeText(item.ip)}><Wifi size={15} /></button>
                </div>
              ))}
              {devices.length === 0 && <div className="emptyState">No devices are connected to this room.</div>}
            </div>
          </div>
          <div className="controlPanel">
            <div className="liveCard">
              <div className="liveMeta">
                <span className={`pill ${socketRef.current?.connected ? "live" : ""}`}>{socketRef.current?.connected ? "CONNECTED" : "DISCONNECTED"}</span>
                <span>{server?.ip}:{server?.port}</span>
              </div>
              <div className="bigTimer">{devices.length}</div>
              <div className="timerTitle">Connected clients</div>
              <div className="transport">
                <button className="primary" onClick={() => navigator.clipboard?.writeText(viewerUrl)}>Copy viewer link</button>
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (activePage === "settings") {
      return (
        <section className="workspace">
          <div className="rundownPanel">
            <div className="panelHead">
              <div>
                <h2>Stage settings</h2>
                <span>Room preferences and controls</span>
              </div>
            </div>
            <div className="timerList">
              <div className="messageCard" style={{ border: "none", background: "transparent" }}>
                <div className="panelHead">
                  <div>
                    <h3>Room preferences</h3>
                    <span>Current room configuration</span>
                  </div>
                </div>
                <div className="editGrid" style={{ padding: "16px" }}>
                  <label>
                    <span>Room name</span>
                    <input value={settingsDraft?.name ?? currentRoom.name} onChange={(event) => setSettingsDraft((current) => current ? { ...current, name: event.target.value } : current)} />
                  </label>
                  <label>
                    <span>Timezone</span>
                    <input value={settingsDraft?.timezone ?? currentRoom.timezone} onChange={(event) => setSettingsDraft((current) => current ? { ...current, timezone: event.target.value } : current)} />
                  </label>
                  <label>
                    <span>Warning window</span>
                    <input type="number" min="0" value={settingsDraft?.warningSeconds ?? currentRoom.warningSeconds} onChange={(event) => setSettingsDraft((current) => current ? { ...current, warningSeconds: Math.max(0, Number(event.target.value)) } : current)} />
                  </label>
                  <label>
                    <span>Critical window</span>
                    <input type="number" min="0" value={settingsDraft?.criticalSeconds ?? currentRoom.criticalSeconds} onChange={(event) => setSettingsDraft((current) => current ? { ...current, criticalSeconds: Math.max(0, Number(event.target.value)) } : current)} />
                  </label>
                </div>
                <div className="editActions">
                  <button className="primary" onClick={saveSettings}>Save settings</button>
                </div>
              </div>
            </div>
          </div>
          <div className="controlPanel">
            <div className="liveCard">
              <div className="liveMeta">
                <span className="pill">MANUAL ADVANCE</span>
                <span>Enabled</span>
              </div>
              <div className="bigTimer">MANUAL</div>
              <div className="timerTitle">Timer completion behavior</div>
              <span className="emptyState">A timer stays on TIME UP until you advance to the next timer.</span>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="workspace">
        <div className="rundownPanel">
          <div className="panelHead">
            <div>
              <h2>Rundown</h2>
              <span>
                {timers.length} segments · Manual advance
              </span>
            </div>
          </div>
          <div className="timerList">
            {timers.map((t, i) => (
              <TimerRow
                key={t.id}
                timer={t}
                index={i}
                selected={selected?.id === t.id}
                onSelect={() => select(t.id)}
                onAction={act}
                onEdit={() => startEdit(t)}
                onDelete={() => removeTimer(t)}
              />
            ))}
            {timers.length === 0 && <div className="emptyState">No timers in this room yet. Add a timer to begin the rundown.</div>}
          </div>
        </div>
        <div className="controlPanel">
          <div className="liveCard">
            <div className="liveMeta">
              <span className={`pill ${selected?.status === "running" ? "live" : ""}`}>
                {selected?.status === "finished" ? "TIME UP" : selected?.status?.toUpperCase() || "IDLE"}
              </span>
              <span>{selected?.speaker || "No speaker assigned"}</span>
            </div>
            <div className="bigTimer">
              {selected ? <LiveTime timer={selected} /> : <span>--:--</span>}
            </div>
            <div className="timerTitle">{selected?.title || "Select a timer"}</div>
            <div className="transport">
              <button className="danger" onClick={() => selected && act("reset", selected.id)}>
                <RotateCcw />
              </button>
              <button className="mainPlay" onClick={() => selected && act(selected.status === "running" ? "pause" : "start", selected.id)}>
                {selected?.status === "running" ? <Pause /> : <Play />}
              </button>
              <button onClick={() => selected && act("nudge", selected.id, { deltaMs: 30000 })}>+30s</button>
              <button onClick={() => selected && act("nudge", selected.id, { deltaMs: -30000 })}>−30s</button>
              <button onClick={() => selected && act("flash", selected.id)}><Flame /></button>
            </div>
            <div className="quick">
              <span>SPACE Start / Pause</span>
              <span>R Reset</span>
              <span>N Next</span>
              <span>F Flash</span>
            </div>
          </div>
          {selected && editTimerId === selected.id && (
            <div className="editCard">
              <div className="panelHead">
                <div>
                  <h3>Edit timer</h3>
                  <span>Update the selected segment</span>
                </div>
              </div>
              <div className="editGrid">
                <label>
                  <span>Title</span>
                  <input
                    value={String(editDraft.title ?? selected.title)}
                    onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Speaker</span>
                  <input
                    value={String(editDraft.speaker ?? selected.speaker)}
                    onChange={(e) => setEditDraft((d) => ({ ...d, speaker: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Duration (ms)</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={Number(editDraft.durationMs ?? selected.durationMs)}
                    onChange={(e) => setEditDraft((d) => ({ ...d, durationMs: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  <span>Warning at (seconds)</span>
                  <input
                    type="number"
                    min="0"
                    value={Number(editDraft.warningSeconds ?? selected.warningSeconds)}
                    onChange={(e) => setEditDraft((d) => ({ ...d, warningSeconds: Math.max(0, Number(e.target.value)) }))}
                  />
                </label>
                <label>
                  <span>Critical at (seconds)</span>
                  <input
                    type="number"
                    min="0"
                    value={Number(editDraft.criticalSeconds ?? selected.criticalSeconds)}
                    onChange={(e) => setEditDraft((d) => ({ ...d, criticalSeconds: Math.max(0, Number(e.target.value)) }))}
                  />
                </label>
                <label className="wide">
                  <span>Notes</span>
                  <textarea
                    value={String(editDraft.notes ?? selected.notes)}
                    onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                  />
                </label>
              </div>
              <div className="editActions">
                <button className="ghost" onClick={cancelEdit}>Cancel</button>
                <button className="primary" onClick={saveEdit}>Save</button>
              </div>
            </div>
          )}
          <div className="messageCard">
            <div className="panelHead">
              <div>
                <h3>Presenter message</h3>
                <span>Synced instantly to outputs</span>
              </div>
              <MessageSquare size={18} />
            </div>
            <div className="messageInput">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a cue for the stage…"
              />
              <button
                onClick={() => {
                  if (message.trim()) {
                    act("message", undefined, { text: message, flash: false });
                    setMessage("");
                  }
                }}
              >
                Send
              </button>
            </div>
            {messages.filter((m) => m.active).map((m) => (
              <div className="activeMessage" key={m.id}>
                <span>{m.text}</span>
                <button onClick={() => act("clearMessage")}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img
            className="brandLogo"
            src="./faithcity-logo.png"
            alt="Faith City Lagos Province 5 HQ"
          />
        </div>
        <div className="roomPicker">
          <small>ACTIVE ROOM</small>
          <div className="roomPickerControls">
            <select aria-label="Active room" value={room.id} onChange={(event) => {
              const nextRoom = rooms.find((item) => item.id === event.target.value);
              if (nextRoom) {
                setRoom(nextRoom);
                select(null);
              }
            }}>
              {rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button className="iconBtn" aria-label="Create room" title="Create room" onClick={openRoomCreation}><Plus size={15} /></button>
            <button className="iconBtn" aria-label={`Delete ${room.name}`} title="Delete active room" onClick={deleteActiveRoom}><Trash2 size={15} /></button>
          </div>
          <small>{rooms.length} rooms · Select a room to activate it</small>
        </div>
        <nav>
          <Nav icon={<LayoutDashboard />} text="Controller" active={showControllerPage} onClick={() => setActivePage("controller")} />
          <Nav icon={<Clock3 />} text="Timers" active={activePage === "timers"} onClick={() => setActivePage("timers")} />
          <Nav icon={<MonitorPlay />} text="Outputs" active={activePage === "outputs"} onClick={() => setActivePage("outputs")} />
          <Nav icon={<CalendarClock />} text="Agenda" active={activePage === "agenda"} onClick={() => setActivePage("agenda")} />
          <Nav icon={<MessageSquare />} text="Messages" active={activePage === "messages"} onClick={() => setActivePage("messages")} />
          <Nav icon={<Wifi />} text="Connections" active={activePage === "connections"} onClick={() => setActivePage("connections")} />
        </nav>
        <div className="sidebarBottom">
          <Nav icon={<Settings />} text="Settings" active={activePage === "settings"} onClick={() => setActivePage("settings")} />
          <div className="serverCard">
            <div>
              <span className="dot" /> Local server
            </div>
            <strong>
              {server ? `${server.ip}:${server.port}` : "Unavailable"}
            </strong>
            <button
              onClick={() => navigator.clipboard?.writeText(viewerUrl)}
            >
              <Copy size={13} /> Copy viewer link
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <small>EVENT CONTROLLER</small>
            <h1>{pageTitles[activePage]}</h1>
          </div>
          <div className="topActions">
            <span className="status">
              <span className={`dot ${socketRef.current?.connected ? "" : "offline"}`} /> {socketRef.current?.connected ? "CONNECTED" : "DISCONNECTED"}
            </span>
            {activePage === "controller" ? (
              <>
                <button className="ghost" onClick={() => openOutput("viewer")}>
                  <ExternalLink size={16} /> Viewer
                </button>
                <button className="primary" onClick={add}>
                  <Plus size={16} /> Add timer
                </button>
              </>
            ) : (
              <button className="primary" onClick={() => openOutput("viewer")}>
                <ExternalLink size={16} /> Open viewer
              </button>
            )}
          </div>
        </header>
        {error && <div className="errorBanner" role="alert">{error}</div>}
        {renderPage()}
      </main>
      {roomCreateDialog}
    </div>
  );
}

function Nav({
  icon,
  text,
  active,
  onClick,
}: {
  icon: any;
  text: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`nav ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      <span>{text}</span>
    </button>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function TimerRow({
  timer,
  index,
  selected,
  onSelect,
  onAction,
  onEdit,
  onDelete,
}: {
  timer: Timer;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onAction: (t: string, id?: string, e?: any) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`timerRow hasDelete ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <div className="drag">⋮⋮</div>
      <div className="index">{String(index + 1).padStart(2, "0")}</div>
      <div className="stripe" style={{ background: timer.color }} />
      <div className="timerInfo">
        <strong>{timer.title}</strong>
        <span>
          {timer.speaker || "No speaker"} · {timer.trigger}
        </span>
      </div>
      <div className="rowTime">{timer.status === "finished" ? "TIME UP" : formatMs(timer.durationMs)}</div>
      <button
        className="rowPlay"
        onClick={(e) => {
          e.stopPropagation();
          onAction(timer.status === "running" ? "pause" : "start", timer.id);
        }}
      >
        {timer.status === "running" ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button
        className="more"
        title="Edit timer"
        aria-label={`Edit ${timer.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <Pencil size={15} />
      </button>
      <button
        className="more deleteTimer"
        title="Delete timer"
        aria-label={`Delete ${timer.title}`}
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm(`Delete “${timer.title}”? This cannot be undone.`)) {
            onDelete();
          }
        }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function LiveTime({ timer }: { timer: Timer }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const x = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(x);
  }, []);
  const t = { ...timer };
  if (t.status === "running")
    t.remainingMs = t.remainingMs - (now - (t.startTimestamp ?? now));
  if (
    t.status === "finished" ||
    (t.type === "countdown" && t.status === "running" && t.remainingMs <= 0)
  )
    return <span className="timeUp">TIME UP</span>;
  return (
    <span className={`${t.remainingMs < 0 ? "overtime" : ""} time-${timerSeverity(t, t.remainingMs)}`}>
      {formatMs(t.remainingMs)}
    </span>
  );
}

function Output({ mode, roomId }: { mode: string; roomId: string }) {
  const [state, setState] = useState<any>();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const s = connectSocket(roomId, mode, "FaithCity Stageflow Output");
    s.on("state", setState);
    const x = setInterval(() => setNow(Date.now()), 100);
    return () => {
      s.disconnect();
      clearInterval(x);
    };
  }, [roomId, mode]);
  if (!state)
    return <div className="output loading">Connecting to FaithCity Stageflow…</div>;
  const active =
    state.timers.find((t: Timer) => t.status === "running") ||
    state.timers.find((t: Timer) => t.status === "paused") ||
    [...state.timers].reverse().find((t: Timer) => t.status === "finished") ||
    state.timers[0];
  const activeIndex = state.timers.findIndex((timer: Timer) => timer.id === active?.id);
  const rem =
    active?.status === "running"
      ? active.remainingMs - (now - (active.startTimestamp || now))
      : active?.remainingMs || 0;
  const severity = active ? timerSeverity(active, rem) : "normal";
  if (mode === "agenda")
    return (
      <div className="agenda">
        <div className="outputBrand">FAITHCITY STAGEFLOW · AGENDA</div>
        <h1>{state.room.name}</h1>
        <div className="agendaGrid">
          {state.timers.map((t: Timer, i: number) => (
            <div
              className={`agendaItem ${active?.id === t.id ? "current" : ""}`}
              key={t.id}
            >
              <div>
                <small>{t.status === "finished" ? "TIME UP" : i === activeIndex ? "NOW" : i === activeIndex + 1 ? "NEXT" : "UPCOMING"}</small>
                <strong>{t.title}</strong>
                <span>{t.speaker || "—"}</span>
              </div>
              <time>{t.status === "finished" ? "TIME UP" : formatMs(t.durationMs)}</time>
            </div>
          ))}
          {state.timers.length === 0 && <div className="emptyState">No agenda items have been added.</div>}
        </div>
      </div>
    );
  if (mode === "moderator")
    return (
      <div className="moderator">
        <div className="outputBrand">FAITHCITY STAGEFLOW · MODERATOR</div>
        <div className="modTop">
          <div>
            <small>{state.room.name}</small>
            <h1 className={`time-${severity}`}>{active?.status === "finished" || (active?.type === "countdown" && rem <= 0) ? "TIME UP" : active ? formatMs(rem) : "--:--"}</h1>
            <strong>{active?.title || "No active timer"}</strong>
          </div>
          <div className="modAgenda">
            {state.timers.slice(0, 5).map((t: Timer) => (
              <div className={t.id === active?.id ? "active" : ""} key={t.id}>
                {t.title}
                <span>{formatMs(t.durationMs)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modMessage">
          {state.messages.find((m: any) => m.active)?.text ||
            "No active message"}
        </div>
      </div>
    );
  return (
    <div className={`viewer ${active?.flash ? "flash" : ""}`}>
      <div className="viewerInner">
        <div className="outputBrand">{state.room.name}</div>
        <div className={`viewerTime ${rem < 0 ? "overtime" : ""} ${active?.status === "finished" || (active?.type === "countdown" && rem <= 0) ? "timeUp" : `time-${severity}`}`}>
          {!active ? "--:--" : active.status === "finished" || (active.type === "countdown" && rem <= 0) ? "TIME UP" : formatMs(rem)}
        </div>
        <div className="viewerTitle">{active?.title || "No active timer"}</div>
        <div className="viewerSpeaker">{active?.speaker}</div>
        {state.messages.find((m: any) => m.active) && (
          <div className="viewerMessage">
            {state.messages.find((m: any) => m.active).text}
          </div>
        )}
      </div>
    </div>
  );
}
