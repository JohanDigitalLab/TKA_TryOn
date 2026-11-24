"use client";

import { PortalPage } from '@/components/school/portal';
import { AgendaSelector } from '@/components/school/agenda';

export default function StudentAgendaPage() {
  return <PortalPage title="Agenda sekolah saya">{portal => <AgendaSelector portal={portal} student />}</PortalPage>;
}
