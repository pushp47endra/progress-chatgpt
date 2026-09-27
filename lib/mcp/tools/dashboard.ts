import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDashboardData } from "@/lib/db/stats";
import { jsonResult, errorResult, getAuthedUserId } from "@/lib/mcp/helpers";

export function registerDashboardTools(server: McpServer) {
  server.registerTool(
    "get_dashboard_progress",
    {
      title: "Get dashboard progress",
      description:
        "Returns the same summary shown on the tracker's main dashboard: days remaining to the GATE CSE 2027 exam, today's study tasks, overall topic/question progress, accuracy, study time (today/week/month/total), and the current/longest study streak. Takes no parameters.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = getAuthedUserId(extra);
      if (!userId) return errorResult("Not authenticated.");

      const data = await getDashboardData(userId);
      return jsonResult(data);
    }
  );
}
