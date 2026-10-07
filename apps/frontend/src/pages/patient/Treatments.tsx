import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Check, Clock, Pill, Stethoscope, X } from "lucide-react";
import type { Appointment, Medication, TreatmentPlanRecord } from "@breastcare/shared";
import { TREATMENT_DISCLAIMER, MEDICATION_DISCLAIMER } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { useAuth } from "@/context/AuthContext";
import { useAvailability, useGrantees, useMedications, useMyAppointments, useTreatments } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Overlay";
import { DataTable, DialogBody, DialogFooter, DialogHeader, DisclaimerCard, EmptyState, ErrorState, PageHeader, ShortDisclaimer, type Column } from "@/components/ui/Feedback";
import { Dialog as ModalDialog } from "@/components/ui/Overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { APPOINTMENT_COPY, DOSE_COPY, MEDICATION_COPY, TREATMENT_COPY } from "@/lib/format";
import { formatDate, formatDateTime, fromNow } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Treatment plans                                                     */
/* ------------------------------------------------------------------ */

export function TreatmentPlansPage() {
  const { patientId } = useAuth();
  const treatments = useTreatments(patientId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treatment Plans"
        description="What your care team has proposed, authorised and started. Plans are authorised by a clinician — the platform never authorises treatment itself."
      />

      <DisclaimerCard title="Treatment information" body={TREATMENT_DISCLAIMER} />

      {treatments.error ? <ErrorState message="We couldn't load your treatment plans." onRetry={() => void treatments.refetch()} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(treatments.data?.treatments ?? []).map((plan) => (
          <TreatmentCard key={plan.id} plan={plan} />
        ))}
      </div>

      {treatments.data?.treatments.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No treatment plans yet"
              description="Once a clinician adds a plan, it will appear here with its status and progress."
              icon={<Stethoscope className="size-5" />}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function TreatmentCard({ plan }: { plan: TreatmentPlanRecord }) {
  const copy = TREATMENT_COPY[plan.status];
  return (
    <Card>
      <CardHead
        title={plan.name}
        description={`${plan.modality.replace(/-/g, " ")} · ${plan.startDate ? formatDate(plan.startDate) : "start to be confirmed"}${
          plan.expectedEndDate ? ` → ${formatDate(plan.expectedEndDate)}` : ""
        }`}
        action={<Badge tone={copy.tone}>{copy.label}</Badge>}
      />
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{plan.summary}</p>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="tabular-nums">{plan.progressPercent}%</span>
          </div>
          <Progress value={plan.progressPercent} />
        </div>

        {plan.sideEffects.length ? (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Possible side effects</p>
            <div className="flex flex-wrap gap-1.5">
              {plan.sideEffects.map((effect) => (
                <Badge key={effect} tone="muted">
                  {effect}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="flex justify-between gap-2 rounded-md border px-2.5 py-1.5">
            <dt>Authorised by</dt>
            <dd>{plan.authorizedByDoctorId ? "Clinician" : "Not yet authorised"}</dd>
          </div>
          <div className="flex justify-between gap-2 rounded-md border px-2.5 py-1.5">
            <dt>Authorised at</dt>
            <dd>{plan.authorizedAt ? formatDate(plan.authorizedAt) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-2 rounded-md border px-2.5 py-1.5">
            <dt>On-chain plan id</dt>
            <dd className="font-mono">{plan.onChainPlanId ? `${plan.onChainPlanId.slice(0, 12)}…` : "not anchored"}</dd>
          </div>
          <div className="flex justify-between gap-2 rounded-md border px-2.5 py-1.5">
            <dt>Documents</dt>
            <dd>{plan.documents.length}</dd>
          </div>
        </dl>

        {plan.notes ? <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">{plan.notes}</p> : null}

        <p className="text-xs text-muted-foreground">Never change a treatment plan on the basis of anything in this app. Speak to your treating clinician first.</p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Medications                                                         */
/* ------------------------------------------------------------------ */

export function MedicationsPage() {
  const { patientId } = useAuth();
  const medications = useMedications(patientId);
  const [openFor, setOpenFor] = useState<Medication | null>(null);

  if (medications.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Medications" description="Your prescribed medicines and dose tracking." />
        <ErrorState message="We couldn't load your medications." onRetry={() => void medications.refetch()} />
      </div>
    );
  }

  const rows = medications.data?.medications ?? [];
  const upcoming = medications.data?.upcomingDoses ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medications"
        description="Track what you take and when. Recording a dose never changes a prescription — only your prescriber can do that."
      />

      <DisclaimerCard title="Medication information" body={MEDICATION_DISCLAIMER} />

      {upcoming.length ? (
        <Card className="border-primary/30">
          <CardContent className="pt-6">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Clock className="size-4" /> Doses due
            </p>
            <ul className="space-y-1.5 text-sm">
              {upcoming.slice(0, 5).map((dose) => {
                const medication = rows.find((entry) => entry.id === dose.medicationId);
                return (
                  <li key={dose.doseId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <span>
                      <span className="font-medium">{medication?.name ?? "Medication"}</span>
                      <span className="text-muted-foreground"> · {medication?.dosage ?? ""}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(dose.scheduledAt)}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <DataTable<Medication>
        rows={rows}
        isLoading={medications.isLoading}
        columns={medicationColumns({ onLog: setOpenFor })}
        empty={<EmptyState title="No medications recorded" description="Prescriptions added by your clinician will appear here." icon={<Pill className="size-5" />} />}
      />

      <DoseDialog medication={openFor} onClose={() => setOpenFor(null)} />
    </div>
  );
}

function medicationColumns({ onLog }: { onLog: (medication: Medication) => void }): Column<Medication>[] {
  return [
    {
      key: "name",
      header: "Medication",
      cell: (medication) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{medication.name}</p>
          <p className="truncate text-xs text-muted-foreground">{medication.activeIngredient}</p>
        </div>
      ),
    },
    { key: "dosage", header: "Dose", cell: (medication) => <span className="whitespace-nowrap">{medication.dosage}</span> },
    { key: "frequency", header: "Schedule", cell: (medication) => <span className="text-muted-foreground">{medication.frequency}</span> },
    { key: "status", header: "Status", cell: (medication) => <Badge tone={MEDICATION_COPY[medication.status].tone}>{MEDICATION_COPY[medication.status].label}</Badge> },
    {
      key: "doses",
      header: "Recent doses",
      cell: (medication) => {
        const recent = medication.doses.slice(0, 5);
        if (!recent.length) return <span className="text-xs text-muted-foreground">None scheduled</span>;
        return (
          <div className="flex gap-1">
            {recent.map((dose) => (
              <span
                key={dose.id}
                title={`${dose.status} — ${formatDateTime(dose.scheduledAt)}`}
                className={
                  dose.status === "taken"
                    ? "size-2.5 rounded-full bg-success"
                    : dose.status === "missed"
                      ? "size-2.5 rounded-full bg-destructive"
                      : dose.status === "skipped"
                        ? "size-2.5 rounded-full bg-muted-foreground"
                        : "size-2.5 rounded-full border border-border"
                }
              />
            ))}
          </div>
        );
      },
    },
    {
      key: "action",
      header: "",
      className: "text-right",
      cell: (medication) => (
        <Button variant="outline" size="sm" onClick={() => onLog(medication)} disabled={medication.doses.length === 0}>
          Record a dose
        </Button>
      ),
    },
  ];
}

function DoseDialog({ medication, onClose }: { medication: Medication | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { patientId } = useAuth();
  const [doseId, setDoseId] = useState("");
  const [status, setStatus] = useState<"taken" | "missed" | "skipped">("taken");
  const [note, setNote] = useState("");

  const submit = useMutation({
    mutationFn: () => api.post("/medications/dose", { medicationId: medication?.id, doseId, status, note: note || null }),
    onSuccess: () => {
      toast.success("Dose recorded");
      setDoseId("");
      setNote("");
      onClose();
      void queryClient.invalidateQueries({ queryKey: queryKeys.medications(patientId ?? "me") });
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient.overview });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const pending = medication?.doses.filter((dose) => dose.status === "pending") ?? [];

  return (
    <ModalDialog open={Boolean(medication)} onOpenChange={(open) => !open && onClose()}>
      <DialogHeader
        title={`Record a dose — ${medication?.name ?? ""}`}
        description="This records what you took. It never changes the dose your prescriber set."
        onClose={onClose}
      />
      <DialogBody className="space-y-4">
        {medication ? (
          <>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {medication.dosage} · {medication.route} · {medication.frequency}
              {medication.instructions ? <p className="mt-1">{medication.instructions}</p> : null}
            </div>

            <Field label="Which dose?" htmlFor="dose" required>
              <Select id="dose" value={doseId} onChange={(event) => setDoseId(event.target.value)}>
                <option value="">Select a scheduled dose…</option>
                {medication.doses.slice(0, 14).map((dose) => (
                  <option key={dose.id} value={dose.id} disabled={dose.status !== "pending"}>
                    {formatDateTime(dose.scheduledAt)} — {DOSE_COPY[dose.status]?.label ?? dose.status}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="What happened?" htmlFor="status">
              <Select id="status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                <option value="taken">I took it</option>
                <option value="missed">I missed it</option>
                <option value="skipped">I skipped it deliberately</option>
              </Select>
            </Field>

            <Field label="Note" htmlFor="note" hint="Optional — for example how you felt afterwards.">
              <Input id="note" value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>

            {pending.length === 0 ? <p className="text-xs text-muted-foreground">All scheduled doses for this medication have already been recorded.</p> : null}

            {medication.cautions ? <p className="text-xs text-warning">{medication.cautions}</p> : null}
          </>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!doseId}>
          Save
        </Button>
      </DialogFooter>
    </ModalDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

export function AppointmentsPage() {
  const queryClient = useQueryClient();
  const { patientId } = useAuth();
  const appointments = useMyAppointments();
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);

  const cancel = useMutation({
    mutationFn: (id: string) => api.patch(`/appointments/${id}/status`, { status: "cancelled" }),
    onSuccess: () => {
      toast.success("Appointment cancelled");
      setCancelling(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments("me") });
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient.overview });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const upcoming = appointments.data?.upcoming ?? [];
  const past = appointments.data?.past ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description="Book, review and cancel your appointments. Only your care team can confirm or complete them."
        actions={
          <Button onClick={() => setBooking(true)}>
            <CalendarDays className="size-4" /> Request an appointment
          </Button>
        }
      />

      <ShortDisclaimer />

      {appointments.error ? <ErrorState message="We couldn't load your appointments." onRetry={() => void appointments.refetch()} /> : null}

      <Card>
        <CardHead title="Upcoming" />
        <CardContent>
          <DataTable<Appointment>
            rows={upcoming}
            isLoading={appointments.isLoading}
            columns={appointmentColumns({ onCancel: setCancelling })}
            empty={<EmptyState title="No upcoming appointments" description="Request one and your care team will confirm it." icon={<CalendarDays className="size-5" />} />}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHead title="Past" />
        <CardContent>
          <DataTable<Appointment>
            rows={past}
            columns={pastAppointmentColumns}
            empty={<EmptyState title="No past appointments" />}
          />
        </CardContent>
      </Card>

      <BookDialog
        open={booking}
        onOpenChange={setBooking}
        onBooked={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.appointments("me") });
          void queryClient.invalidateQueries({ queryKey: queryKeys.patient.overview });
          void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
        }}
      />

      <ModalDialog open={Boolean(cancelling)} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogHeader title="Cancel this appointment?" description="Your care team will be notified. If your symptoms are urgent, contact them directly." onClose={() => setCancelling(null)} />
        <DialogBody>
          {cancelling ? (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{cancelling.reason}</p>
              <p className="mt-1 text-muted-foreground">{formatDateTime(cancelling.startsAt)}</p>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setCancelling(null)}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={() => cancelling && cancel.mutate(cancelling.id)} loading={cancel.isPending}>
            <X className="size-4" /> Cancel appointment
          </Button>
        </DialogFooter>
      </ModalDialog>
    </div>
  );
}

function appointmentColumns({ onCancel }: { onCancel: (appointment: Appointment) => void }): Column<Appointment>[] {
  return [
    {
      key: "when",
      header: "When",
      cell: (appointment) => (
        <div className="min-w-0">
          <p className="font-medium">{formatDateTime(appointment.startsAt)}</p>
          <p className="text-xs text-muted-foreground">{fromNow(appointment.startsAt)}</p>
        </div>
      ),
    },
    { key: "reason", header: "Reason", cell: (appointment) => <span className="line-clamp-1">{appointment.reason}</span> },
    { key: "modality", header: "Format", cell: (appointment) => <Badge tone="muted">{appointment.modality === "telehealth" ? "Telehealth" : "In person"}</Badge> },
    { key: "location", header: "Where", cell: (appointment) => <span className="text-muted-foreground">{appointment.location || "—"}</span> },
    {
      key: "status",
      header: "Status",
      cell: (appointment) => <Badge tone={APPOINTMENT_COPY[appointment.status].tone}>{APPOINTMENT_COPY[appointment.status].label}</Badge>,
    },
    {
      key: "action",
      header: "",
      className: "text-right",
      cell: (appointment) =>
        appointment.status === "requested" || appointment.status === "confirmed" ? (
          <Button variant="outline" size="sm" onClick={() => onCancel(appointment)}>
            Cancel
          </Button>
        ) : null,
    },
  ];
}

const pastAppointmentColumns: Column<Appointment>[] = [
  { key: "when", header: "When", cell: (appointment) => formatDate(appointment.startsAt) },
  { key: "reason", header: "Reason", cell: (appointment) => <span className="line-clamp-1">{appointment.reason}</span> },
  { key: "status", header: "Outcome", cell: (appointment) => <Badge tone={APPOINTMENT_COPY[appointment.status].tone}>{APPOINTMENT_COPY[appointment.status].label}</Badge> },
  { key: "notes", header: "Notes", cell: (appointment) => <span className="line-clamp-1 text-muted-foreground">{appointment.notes || "—"}</span> },
];

function BookDialog({ open, onOpenChange, onBooked }: { open: boolean; onOpenChange: (open: boolean) => void; onBooked: () => void }) {
  const [doctorId, setDoctorId] = useState("");
  const [slot, setSlot] = useState("");
  const [reason, setReason] = useState("");
  const [modality, setModality] = useState<"in-person" | "telehealth">("in-person");

  const availability = useAvailability(doctorId || null, 14);
  const slots = availability.data?.slots.filter((entry) => entry.available) ?? [];

  const grantees = useGranteesForBooking();

  const submit = useMutation({
    mutationFn: () => {
      const chosen = slots.find((entry) => entry.startsAt === slot);
      if (!chosen) throw new Error("Choose a time slot");
      return api.post("/appointments", {
        doctorId,
        startsAt: chosen.startsAt,
        endsAt: chosen.endsAt,
        reason,
        modality,
      });
    },
    onSuccess: () => {
      toast.success("Appointment requested");
      setReason("");
      setSlot("");
      onOpenChange(false);
      onBooked();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, typeof slots>();
    for (const entry of slots) {
      const day = entry.startsAt.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), entry]);
    }
    return [...map.entries()];
  }, [slots]);

  return (
    <ModalDialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader title="Request an appointment" description="Your request is sent to the clinician, who confirms it. Choose a slot that is shown as available." onClose={() => onOpenChange(false)} />
      <DialogBody className="space-y-4">
        <Field label="Clinician" htmlFor="doctor" required>
          <Select id="doctor" value={doctorId} onChange={(event) => { setDoctorId(event.target.value); setSlot(""); }}>
            <option value="">Select a clinician…</option>
            {grantees.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name} — {doctor.specialty}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Time" htmlFor="slot" hint={doctorId ? undefined : "Choose a clinician first"} required>
          {doctorId ? (
            availability.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading availability…</p>
            ) : grouped.length ? (
              <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border p-2">
                {grouped.map(([day, entries]) => (
                  <div key={day}>
                    <p className="px-1 py-0.5 text-xs font-medium text-muted-foreground">{formatDate(day)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {entries.map((entry) => (
                        <button
                          key={entry.startsAt}
                          type="button"
                          onClick={() => setSlot(entry.startsAt)}
                          className={
                            slot === entry.startsAt
                              ? "rounded-md border border-primary bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                              : "rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
                          }
                        >
                          {new Date(entry.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No available slots in the next 14 days.</p>
            )
          ) : null}
        </Field>

        <Field label="Reason" htmlFor="reason" required>
          <Textarea id="reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What would you like to discuss?" />
        </Field>

        <Field label="Format" htmlFor="modality">
          <Select id="modality" value={modality} onChange={(event) => setModality(event.target.value as typeof modality)}>
            <option value="in-person">In person</option>
            <option value="telehealth">Telehealth</option>
          </Select>
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!doctorId || !slot || reason.trim().length < 3}>
          <Check className="size-4" /> Request
        </Button>
      </DialogFooter>
    </ModalDialog>
  );
}

function useGranteesForBooking() {
  const { data } = useGrantees();
  return data?.grantees ?? [];
}
