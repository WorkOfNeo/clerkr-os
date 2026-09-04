"use client";

import { addTicketAttachments, updateTicket } from "@/app/tickets/actions";
import { EditableBody } from "@/components/editor/EditableBody";

/** The ticket's detail, editable in place. Thin wrapper so the shared editor
 *  stays free of any one surface's server actions. */
export function TicketBody({ ticketId, body }: { ticketId: string; body: string | null }) {
  return (
    <EditableBody
      value={body}
      onSave={(markdown) => updateTicket({ id: ticketId, body: markdown })}
      onAttach={(images) =>
        addTicketAttachments(
          ticketId,
          images.map((i) => ({
            dataUrl: i.dataUrl,
            fileName: i.fileName,
            ...(i.width ? { width: i.width } : {}),
            ...(i.height ? { height: i.height } : {}),
          })),
        )
      }
      emptyPrompt="Add detail"
    />
  );
}
