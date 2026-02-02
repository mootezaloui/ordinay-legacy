import PageLayout from "../components/layout/PageLayout";
import { AgentLayout } from "./AgentLayout";
import { AgentSessionsProvider } from "./hooks/useAgentSessions";

export default function AgentScreen() {
  return (
    <PageLayout fullHeight noHeaderSpacer>
      <AgentSessionsProvider>
        <AgentLayout />
      </AgentSessionsProvider>
    </PageLayout>
  );
}
