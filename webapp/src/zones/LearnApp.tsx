import { Routes, Route } from "react-router-dom";
import { RequireAccount } from "../lib/auth";
import { CourseOverview } from "../screens/learn/CourseOverview";
import { LessonPlayer } from "../screens/learn/LessonPlayer";
import { CourseCompleted } from "../screens/learn/CourseCompleted";
import { ResumeTraining } from "../screens/learn/ResumeTraining";
import { AppShell } from "../AppShell";
import { BrowserRoot } from "../AppRoot";
import { ZoneExit } from "./ZoneExit";

/**
 * The learn zone (`lib/appZones.ts`): the learner's own pages,
 * `/academy/lecon` and `/academy/mes-formations/*`, mounted by
 * `app/academy/(learner)` in the browser only, under a layout that turns
 * signed-out visitors away on the server. The Academy's sales pages are
 * public: they stay in the public zone.
 */
export default function LearnApp() {
  return (
    <BrowserRoot>
      <AppShell zone="learn">
        <Routes>
          {/* The historical entry point: every "open this course"
              action lands here, and it forwards to the overview of
              the course that was just opened. */}
          <Route
            path="/academy/lecon"
            element={
              <RequireAccount>
                <ResumeTraining />
              </RequireAccount>
            }
          />
          {/* The learner's own pages for a course on the account:
              its overview, each lesson (a step, or a module's
              knowledge check) and the completion screen. Gated by
              the account here, and by the enrolment inside each
              page (`lib/learning/access.ts`). */}
          <Route
            path="/academy/mes-formations/:courseId"
            element={
              <RequireAccount>
                <CourseOverview />
              </RequireAccount>
            }
          />
          <Route
            path="/academy/mes-formations/:courseId/lecon/:nodeKey"
            element={
              <RequireAccount>
                <LessonPlayer />
              </RequireAccount>
            }
          />
          <Route
            path="/academy/mes-formations/:courseId/terminee"
            element={
              <RequireAccount>
                <CourseCompleted />
              </RequireAccount>
            }
          />
          <Route path="*" element={<ZoneExit zone="learn" />} />
        </Routes>
      </AppShell>
    </BrowserRoot>
  );
}
