"use client";

import { StudentDashboard } from "../student/page";
import StudentActionTables from "@/components/student/action-tables";

export default function MStudentPage() {
  return <StudentDashboard actionContent={<StudentActionTables />} />;
}
