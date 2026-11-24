"use client";

import { PortalPage } from '@/components/school/portal';
import { AgendaSelector } from '@/components/school/agenda';

export default function SchoolAgendaPage() {
  return <PortalPage title="Agenda sekolah · SET">{portal => <AgendaSelector portal={portal} />}</PortalPage>;
}
