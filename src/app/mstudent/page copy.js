"use client";

import StudentPage from "../student/page";
import StudentActionTables from "@/components/student/action-tables";

export default function MStudentPage() {
  return <StudentPage actionContent={<StudentActionTables />} />;
}
