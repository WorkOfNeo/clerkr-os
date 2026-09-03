import { redirect } from "next/navigation";

// Chat is the front door: everything else in the app is reachable from what you
// file here, and the fastest path from "I have a thought" to "it's recorded"
// should be the thing you land on.
export default function HomePage() {
  redirect("/chat");
}
