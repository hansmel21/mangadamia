// Arena event creator — quiz / prediction pool / draw competition builders,
// with an optional SYSTEM auto-announcement.
import { useCallback, useEffect, useState } from "react";
import { req } from "../api";

interface EventRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  entryCount: number;
}
interface QuizQuestion {
  q: string;
  options: string[];
  correct: number;
}

const emptyQuestion = (): QuizQuestion => ({ q: "", options: ["", ""], correct: 0 });

export function ArenaEvents() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [kind, setKind] = useState<"quiz" | "poll" | "draw">("quiz");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([emptyQuestion()]);
  const [durationSec, setDurationSec] = useState(90);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [prompt, setPrompt] = useState("");
  const [announce, setAnnounce] = useState(true);
  const [announceNotify, setAnnounceNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    req<{ events: EventRow[] }>("/arena/events")
      .then((r) => setRows(r.events))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const config =
        kind === "quiz"
          ? {
              questions: questions.map((q) => ({
                q: q.q.trim(),
                options: q.options.map((o) => o.trim()).filter(Boolean),
                correct: q.correct,
              })),
              durationSec,
            }
          : kind === "poll"
            ? { options: pollOptions.map((o) => o.trim()).filter(Boolean) }
            : { prompt: prompt.trim() };
      await req("/admin/arena/events", "POST", {
        kind,
        title: title.trim(),
        description: description.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        config,
        ...(announce ? { announce: { pinned: true, notify: announceNotify } } : {}),
      });
      setNotice(`${kind} created${announce ? " + announced" : ""}.`);
      setTitle("");
      setDescription("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>ARENA EVENTS</h1>
      <div className="filters">
        <div>
          <label>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="quiz">quiz</option>
            <option value="poll">prediction pool</option>
            <option value="draw">draw competition</option>
          </select>
        </div>
        <div>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gate Quiz W29" />
        </div>
        <div>
          <label>Starts</label>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div>
          <label>Ends</label>
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {kind === "quiz" ? (
        <div>
          <div className="field">
            <label>Duration (seconds)</label>
            <input
              type="number"
              value={durationSec}
              min={30}
              max={600}
              onChange={(e) => setDurationSec(Number(e.target.value))}
              style={{ width: 110 }}
            />
          </div>
          {questions.map((question, qi) => (
            <div key={qi} className="field" style={{ border: "1px solid var(--border)", padding: 12, borderRadius: 4 }}>
              <label>Question {qi + 1}</label>
              <input
                value={question.q}
                onChange={(e) =>
                  setQuestions((old) => old.map((x, i) => (i === qi ? { ...x, q: e.target.value } : x)))
                }
                placeholder="Who is the Shadow Monarch?"
              />
              {question.options.map((option, oi) => (
                <div key={oi} className="row" style={{ marginTop: 6 }}>
                  <input
                    type="radio"
                    checked={question.correct === oi}
                    onChange={() =>
                      setQuestions((old) => old.map((x, i) => (i === qi ? { ...x, correct: oi } : x)))
                    }
                    title="correct answer"
                  />
                  <input
                    value={option}
                    style={{ flex: 1 }}
                    onChange={(e) =>
                      setQuestions((old) =>
                        old.map((x, i) =>
                          i === qi
                            ? { ...x, options: x.options.map((o, j) => (j === oi ? e.target.value : o)) }
                            : x,
                        ),
                      )
                    }
                    placeholder={`option ${oi + 1}`}
                  />
                </div>
              ))}
              <div className="row" style={{ marginTop: 8 }}>
                {question.options.length < 4 ? (
                  <button
                    className="ghost"
                    onClick={() =>
                      setQuestions((old) =>
                        old.map((x, i) => (i === qi ? { ...x, options: [...x.options, ""] } : x)),
                      )
                    }
                  >
                    + option
                  </button>
                ) : null}
                {questions.length > 1 ? (
                  <button className="danger" onClick={() => setQuestions((old) => old.filter((_, i) => i !== qi))}>
                    remove question
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {questions.length < 20 ? (
            <button className="ghost" onClick={() => setQuestions((old) => [...old, emptyQuestion()])}>
              + QUESTION
            </button>
          ) : null}
        </div>
      ) : kind === "poll" ? (
        <div className="field">
          <label>Options (2–6)</label>
          {pollOptions.map((option, i) => (
            <input
              key={i}
              value={option}
              onChange={(e) => setPollOptions((old) => old.map((o, j) => (j === i ? e.target.value : o)))}
              placeholder={`option ${i + 1}`}
              style={{ marginBottom: 6 }}
            />
          ))}
          {pollOptions.length < 6 ? (
            <button className="ghost" onClick={() => setPollOptions((old) => [...old, ""])}>
              + option
            </button>
          ) : null}
        </div>
      ) : (
        <div className="field">
          <label>Draw prompt</label>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Draw your favorite protagonist mid-awakening" />
        </div>
      )}

      <div className="row" style={{ margin: "14px 0" }}>
        <label className="row">
          <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
          auto-publish SYSTEM announcement
        </label>
        {announce ? (
          <label className="row">
            <input type="checkbox" checked={announceNotify} onChange={(e) => setAnnounceNotify(e.target.checked)} />
            + notify every reader
          </label>
        ) : null}
        <button disabled={busy || !title.trim() || !startsAt || !endsAt} onClick={create}>
          {busy ? "CREATING…" : "CREATE EVENT ▸"}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="ok">{notice}</p> : null}

      <h1 style={{ marginTop: 28 }}>RECENT EVENTS</h1>
      <table>
        <thead>
          <tr>
            <th>Kind</th>
            <th>Title</th>
            <th>Window</th>
            <th>Status</th>
            <th>Entries</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td>
                <span className="chip">{e.kind}</span>
              </td>
              <td>{e.title}</td>
              <td className="muted">
                {new Date(e.startsAt).toLocaleString()} → {new Date(e.endsAt).toLocaleString()}
              </td>
              <td>
                <span className={`chip ${e.status === "live" ? "visible" : ""}`}>{e.status}</span>
              </td>
              <td>{e.entryCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
