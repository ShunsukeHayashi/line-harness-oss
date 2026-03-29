/**
 * Discord Guild Member ロール付与ヘルパー (Phase 4b)
 *
 * PUT /guilds/:guildId/members/:userId/roles/:roleId は冪等。
 * 204 = 成功、204 = 既存ロールへの再付与も 204。
 * discord_roles カラムにロールIDを記録して重複API呼び出しを防ぐ。
 */

/** Discord API でロールを付与し、unified_profiles.discord_roles を更新する */
export async function grantDiscordRole(
  botToken: string,
  guildId: string,
  discordId: string,
  roleId: string,
  lineUid: string,
  db: D1Database,
): Promise<void> {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}/roles/${roleId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Length': '0',
        'X-Audit-Log-Reason': 'PPAL Teachable member verified via LINE OAuth',
      },
    },
  );

  // 204 = role assigned, 204 でも ok / 200 は通常返らないが安全のため
  if (res.ok || res.status === 204) {
    // discord_roles JSON配列にロールIDを追記（冪等性管理）
    await db
      .prepare(
        `UPDATE unified_profiles
           SET discord_roles = json_insert(COALESCE(discord_roles, '[]'), '$[#]', ?),
               updated_at    = ?
         WHERE line_uid = ?`,
      )
      .bind(roleId, new Date().toISOString(), lineUid)
      .run();
    console.log(`[discord-role] granted role ${roleId} to ${discordId} (line_uid=${lineUid})`);
  } else {
    const body = await res.text().catch(() => '(unreadable)');
    // ロール付与失敗はログのみ。LINE連携フロー自体は成功させる。
    console.error(`[discord-role] failed ${res.status} discordId=${discordId}`, body);
  }
}

/** unified_profiles.discord_roles に指定ロールIDが既に含まれているか確認 */
export function hasRole(discordRolesJson: string | null, roleId: string): boolean {
  if (!discordRolesJson) return false;
  try {
    return (JSON.parse(discordRolesJson) as string[]).includes(roleId);
  } catch {
    return false;
  }
}
