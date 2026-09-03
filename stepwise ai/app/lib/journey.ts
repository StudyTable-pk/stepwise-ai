// ============================================================================
// Learning Journey Engine (doc 07).
// Concept is the primary unit. Mastery is evidence-based — never granted for
// reading an explanation or clicking continue. Misconceptions have a
// lifecycle. Recommendations are explainable.
// ============================================================================
import { db, nowIso } from "@/lib/db";
import type { ConceptStatus, DetectedError, Recommendation } from "@/lib/types";

const STATUS_ORDER: ConceptStatus[] = [
  "UNKNOWN",
  "INTRODUCED",
  "EXPLORING",
  "DEVELOPING",
  "PARTIALLY_UNDERSTOOD",
  "UNDERSTOOD",
  "STRONG",
  "MASTERED"
];

function rank(status: ConceptStatus): number {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? 0 : i;
}

function ensureConcept(name: string, subject: string, topic: string): number {
  const existing = db.get("concepts", { name });
  if (existing) return Number(existing.id);
  const r = db.insert("concepts", {
    name: name.slice(0, 200),
    subject: subject.slice(0, 100),
    topic: topic.slice(0, 120),
    definition: ""
  });
  return r.lastInsertRowid;
}

export interface JourneyUpdateInput {
  userId: number;
  sessionId: number;
  subject: string;
  topic: string;
  concepts: string[];
  stepsCompleted: number;
  stepsTotal: number;
  errors: DetectedError[];
  selfCorrections: string[];
  hintsUsedCount: number;
  misconceptionDescriptions: Array<{ description: string; concept: string }>;
}

export interface JourneyUpdateResult {
  conceptsUpdated: number;
  misconceptionsDetected: number;
  reviewScheduled: number;
  recommendations: Recommendation[];
}

export function updateLearningJourney(input: JourneyUpdateInput): JourneyUpdateResult {
  return db.transaction(() => {
    const now = nowIso();
    const completionRatio = input.stepsTotal > 0 ? input.stepsCompleted / input.stepsTotal : 0;
    const conceptualErrors = input.errors.filter((e) => e.category === "CONCEPTUAL");

    let misconceptionsDetected = 0;
    let reviewScheduled = 0;

    // Misconception lifecycle (doc 07 §14–15).
    for (const m of input.misconceptionDescriptions) {
      const existing = db.all("misconceptions", { user_id: input.userId, description: m.description })
        .find((x) => x.status !== "RESOLVED");
      if (existing) {
        const count = Number(existing.occurrence_count) + 1;
        const status =
          count >= 3
            ? "RECURRING"
            : existing.status === "CORRECTED_ONCE"
              ? "RECURRING"
              : "BEING_ADDRESSED";
        db.update(
          "misconceptions",
          { id: Number(existing.id) },
          { occurrence_count: count, status, last_detected: now }
        );
      } else {
        db.insert("misconceptions", {
          user_id: input.userId,
          concept_name: m.concept.slice(0, 200),
          description: m.description.slice(0, 500),
          status: "DETECTED",
          occurrence_count: 1,
          first_detected: now,
          last_detected: now,
          resolved_at: null
        });
        misconceptionsDetected++;
      }
    }

    // Concept state transitions — evidence-driven only.
    for (const conceptName of input.concepts) {
      const conceptId = ensureConcept(conceptName, input.subject, input.topic);
      const row = db.get("student_concepts", { user_id: input.userId, concept_id: conceptId });

      const current: ConceptStatus = (row?.status as ConceptStatus) ?? "UNKNOWN";
      const priorEvidence = Number(row?.evidence_count ?? 0);
      let next: ConceptStatus = current;
      let evidenceDelta = 0;

      if (completionRatio >= 1) {
        // Full completion of a step-based session is evidence of understanding.
        const selfCorrectionEvidence = input.selfCorrections.length > 0 ? 1 : 0;
        evidenceDelta = 1 + selfCorrectionEvidence;
        next =
          rank(current) >= rank("UNDERSTOOD") && evidenceDelta >= 2 && input.hintsUsedCount === 0
            ? "STRONG"
            : "UNDERSTOOD";
        // Mastery requires repeated varied evidence — never one session.
        if (priorEvidence + evidenceDelta >= 4 && input.hintsUsedCount <= 1) {
          next = "MASTERED";
        }
      } else if (completionRatio > 0) {
        evidenceDelta = 1;
        next =
          input.hintsUsedCount >= 3
            ? "DEVELOPING"
            : rank(current) >= rank("PARTIALLY_UNDERSTOOD")
              ? current
              : "PARTIALLY_UNDERSTOOD";
      } else {
        next = rank(current) >= rank("INTRODUCED") ? current : "INTRODUCED";
      }

      if (conceptualErrors.length > 0 && completionRatio < 1) {
        next = "DEVELOPING";
      }

      if (!row) {
        db.insert("student_concepts", {
          user_id: input.userId,
          concept_id: conceptId,
          status: next,
          confidence: evidenceDelta >= 2 ? "medium" : "low",
          evidence_count: evidenceDelta,
          self_correction_count: input.selfCorrections.length,
          hint_count: input.hintsUsedCount,
          last_seen: now,
          last_practiced: completionRatio > 0 ? now : null,
          review_due: null,
          updated_at: now
        });
      } else {
        db.update(
          "student_concepts",
          { user_id: input.userId, concept_id: conceptId },
          {
            status: next,
            evidence_count: priorEvidence + evidenceDelta,
            hint_count: Number(row.hint_count ?? 0) + input.hintsUsedCount,
            self_correction_count: Number(row.self_correction_count ?? 0) + input.selfCorrections.length,
            last_seen: now,
            last_practiced: completionRatio > 0 ? now : row.last_practiced,
            updated_at: now
          }
        );
      }

      if (evidenceDelta > 0) {
        db.insert("mastery_evidence", {
          user_id: input.userId,
          concept_id: conceptId,
          session_id: input.sessionId,
          evidence_type: input.selfCorrections.length > 0 ? "SELF_CORRECTION" : "CORRECT_REASONING",
          detail: `Step completion ${input.stepsCompleted}/${input.stepsTotal}`,
          created_at: now
        });
      }

      // Spaced review for concepts that are still developing.
      if (["DEVELOPING", "PARTIALLY_UNDERSTOOD", "EXPLORING"].includes(next)) {
        const due = new Date(Date.now() + 2 * 86400_000).toISOString();
        db.insert("review_items", {
          user_id: input.userId,
          concept_name: conceptName.slice(0, 200),
          due_at: due,
          reason: "Concept is still developing",
          status: "pending",
          created_at: now
        });
        db.update(
          "student_concepts",
          { user_id: input.userId, concept_id: conceptId },
          { review_due: due }
        );
        reviewScheduled++;
      }
    }

    // Recommendations — explainable, shame-free (doc 07 recommendation types).
    const recs: Recommendation[] = [];
    if (completionRatio >= 1 && conceptualErrors.length === 0) {
      recs.push({
        type: "GO_DEEPER",
        title: `Go deeper into ${input.topic}`,
        reason: "You completed every step and showed solid understanding."
      });
    } else if (completionRatio >= 1) {
      recs.push({
        type: "PRACTICE",
        title: `Practice ${input.topic} once more`,
        reason: "You finished, but a quick practice round will strengthen the ideas that needed hints."
      });
    } else if (completionRatio > 0) {
      recs.push({
        type: "CONTINUE",
        title: `Continue ${input.topic}`,
        reason: "You were making progress — pick up from the step you reached."
      });
    } else {
      recs.push({
        type: "REVIEW",
        title: `Revisit ${input.topic}`,
        reason: "A fresh look with smaller steps will help you get moving."
      });
    }
    if (conceptualErrors.length >= 2) {
      recs.push({
        type: "STRENGTHEN_PREREQUISITE",
        title: "Strengthen the foundations",
        reason: "Several conceptual errors suggest an earlier idea is worth revisiting first."
      });
    }

    for (const r of recs) {
      db.insert("recommendations", {
        user_id: input.userId,
        type: r.type,
        title: r.title.slice(0, 200),
        reason: r.reason.slice(0, 400),
        created_at: now
      });
    }

    db.insert("learning_events", {
      user_id: input.userId,
      session_id: input.sessionId,
      event_type: "journey_updated",
      detail_json: JSON.stringify({
        concepts: input.concepts.length,
        misconceptions: misconceptionsDetected
      }),
      created_at: now
    });

    return {
      conceptsUpdated: input.concepts.length,
      misconceptionsDetected,
      reviewScheduled,
      recommendations: recs
    };
  });
}

// --- Read side ------------------------------------------------------------------
export interface JourneyConceptView {
  name: string;
  subject: string;
  topic: string;
  status: ConceptStatus;
  evidence_count: number;
  review_due: string | null;
}

export function getJourney(userId: number): {
  concepts: JourneyConceptView[];
  misconceptions: Array<{
    description: string;
    concept_name: string;
    status: string;
    occurrence_count: number;
  }>;
  reviews: Array<{ concept_name: string; due_at: string; reason: string; status: string }>;
  recommendations: Recommendation[];
  events: Array<{ event_type: string; created_at: string; detail_json: string }>;
  stats: { sessions: number; completed: number; self_corrections: number };
} {
  const conceptRows = db.all("student_concepts", { user_id: userId }, { key: "updated_at", dir: "desc" }).slice(0, 100);
  const concepts: JourneyConceptView[] = conceptRows.map((sc) => {
    const c = db.get("concepts", { id: Number(sc.concept_id) });
    return {
      name: String(c?.name ?? "Concept"),
      subject: String(c?.subject ?? ""),
      topic: String(c?.topic ?? ""),
      status: sc.status as ConceptStatus,
      evidence_count: Number(sc.evidence_count ?? 0),
      review_due: (sc.review_due as string | null) ?? null
    };
  });

  const misconceptions = db
    .all("misconceptions", { user_id: userId }, { key: "last_detected", dir: "desc" })
    .slice(0, 30)
    .map((m) => ({
      description: String(m.description),
      concept_name: String(m.concept_name),
      status: String(m.status),
      occurrence_count: Number(m.occurrence_count)
    }));

  const reviews = db
    .all("review_items", { user_id: userId, status: "pending" }, { key: "due_at" })
    .slice(0, 30)
    .map((r) => ({
      concept_name: String(r.concept_name),
      due_at: String(r.due_at),
      reason: String(r.reason),
      status: String(r.status)
    }));

  const recommendations = db
    .all("recommendations", { user_id: userId }, { key: "id", dir: "desc" })
    .slice(0, 6)
    .map((r) => ({
      type: r.type as Recommendation["type"],
      title: String(r.title),
      reason: String(r.reason)
    }));

  const events = db
    .all("learning_events", { user_id: userId }, { key: "id", dir: "desc" })
    .slice(0, 30)
    .map((e) => ({
      event_type: String(e.event_type),
      created_at: String(e.created_at),
      detail_json: String(e.detail_json ?? "{}")
    }));

  const sessions = db.all("sessions", { user_id: userId });
  const selfCorr = db
    .all("errors", { user_id: userId })
    .filter((e) => Number(e.self_corrected))
    .length;

  return {
    concepts,
    misconceptions,
    reviews,
    recommendations,
    events,
    stats: {
      sessions: sessions.length,
      completed: sessions.filter((s) => s.status === "completed").length,
      self_corrections: selfCorr
    }
  };
}
