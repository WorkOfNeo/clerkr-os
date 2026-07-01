import { redirect } from "next/navigation";

import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createSprint } from "../actions";

function nextMondayISO(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToMon = (1 - today.getDay() + 7) % 7 || 7;
  return new Date(today.getTime() + daysToMon * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export default async function NewSprintPage() {
  const session = await requireSession();

  async function action(formData: FormData) {
    "use server";
    await createSprint(formData);
  }

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-lg space-y-6 py-8">
        <div>
          <h1 className="text-xl font-semibold">New sprint</h1>
          <p className="text-sm text-muted-foreground">
            Two weeks from the start date. Testing days are auto-set (first Thursday + next-week
            Wed/Fri) and editable later.
          </p>
        </div>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="Sprint 23" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              required
              defaultValue={nextMondayISO()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal">Goal (optional)</Label>
            <Textarea id="goal" name="goal" rows={3} placeholder="What's the headline outcome?" />
          </div>
          <div className="flex justify-end gap-2">
            <Button asChild variant="outline">
              <a href="/sprints">Cancel</a>
            </Button>
            <Button type="submit">Create sprint</Button>
          </div>
        </form>
      </main>
    </div>
  );
}
