import { describe, expect, it } from "vitest";
import { step1Command } from "./add-bot-spawn-command";

// HV-129: the Add-a-Bot spawn command must write a .bot-hive-kickoff marker
// file alongside .bot-hive-identity. The marker is the second kickoff
// trigger; without it the spawned bot waits for the operator to type
// `start the hive` in the new terminal, defeating the whole point of
// Add-a-Bot.

describe("step1Command writes the kickoff marker (HV-129)", () => {
  it("windows command writes .bot-hive-kickoff", () => {
    const { command } = step1Command("windows", "buzz", "allavallc");
    expect(command).toContain("worktrees/buzz/.bot-hive-kickoff");
    expect(command).toContain("worktrees/buzz/.bot-hive-identity");
  });

  it("mac command writes .bot-hive-kickoff", () => {
    const { command } = step1Command("mac", "buzz", "allavallc");
    expect(command).toContain("worktrees/buzz/.bot-hive-kickoff");
    expect(command).toContain("worktrees/buzz/.bot-hive-identity");
  });

  it("linux command writes .bot-hive-kickoff", () => {
    const { command } = step1Command("linux", "buzz", "allavallc");
    expect(command).toContain("worktrees/buzz/.bot-hive-kickoff");
    expect(command).toContain("worktrees/buzz/.bot-hive-identity");
  });

  it("marker write happens AFTER worktree add and identity write on posix", () => {
    const { command } = step1Command("mac", "buzz", "allavallc");
    const worktreeIdx = command.indexOf("git worktree add");
    const identityIdx = command.indexOf(".bot-hive-identity");
    const kickoffIdx = command.indexOf(".bot-hive-kickoff");
    expect(worktreeIdx).toBeGreaterThan(-1);
    expect(identityIdx).toBeGreaterThan(worktreeIdx);
    expect(kickoffIdx).toBeGreaterThan(identityIdx);
  });

  it("marker write happens AFTER identity write on windows", () => {
    const { command } = step1Command("windows", "buzz", "allavallc");
    const identityIdx = command.indexOf(".bot-hive-identity");
    const kickoffIdx = command.indexOf(".bot-hive-kickoff");
    expect(identityIdx).toBeGreaterThan(-1);
    expect(kickoffIdx).toBeGreaterThan(identityIdx);
  });
});
