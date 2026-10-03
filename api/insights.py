"""Pure functions from the dashboard's Python API.

`metrics()` flattens one Meta Insights row into the numbers the dashboard shows.
`signals()` turns those numbers into plain-language hints by the thresholds in `rules`.

Neither function calls Meta. In the server they run on rows that were already fetched and cached;
the rules come from a rules file, and `today` is the date in the ad account's own time zone.
The hint texts are in Russian because the dashboard interface is in Russian.
"""
from datetime import datetime

MESSAGING = "onsite_conversion.messaging_conversation_started_7d"

# What counts as one «result» for each ad set optimization goal: (action key, English label, Russian label).
RESULT_BY_GOAL = {
    "REACH": ("reach", "Reach", "Охват"),
    "IMPRESSIONS": ("impressions", "Impressions", "Показы"),
    "LANDING_PAGE_VIEWS": ("landing_page_view", "Landing page views", "Просмотры страницы"),
    "LINK_CLICKS": ("link_click", "Link clicks", "Клики по ссылке"),
    "CONVERSATIONS": (MESSAGING, "Messaging conversations started", "Начатые переписки"),
    "THRUPLAY": ("thruplay", "ThruPlays", "Досмотры ThruPlay"),
    "OFFSITE_CONVERSIONS": ("lead", "Leads", "Лиды"),
    "LEAD_GENERATION": ("lead", "Leads", "Лиды"),
}


def num(v, cast=float):
    """Meta sends numbers as strings and leaves out fields that have no data."""
    try:
        return cast(float(v))
    except (TypeError, ValueError):
        return cast(0)


def act(items, *types):
    """Sum the values of the given action types in a Meta `actions` list."""
    return sum(num(x.get("value")) for x in items or [] if x.get("action_type") in types)


def metrics(r, goal=None):
    """Flatten one Insights row into the numbers the dashboard shows."""
    a = r.get("actions", [])
    spend, impressions, reach = num(r.get("spend")), num(r.get("impressions"), int), num(r.get("reach"), int)
    video3s = int(act(a, "video_view"))
    thruplay = int(act(r.get("video_thruplay_watched_actions"), "video_view"))
    out = {
        "spend": round(spend, 2),
        "impressions": impressions,
        "reach": reach,
        "frequency": round(num(r.get("frequency")), 2),
        "cpm": round(num(r.get("cpm")), 2),
        "linkClicks": num(r.get("inline_link_clicks"), int),
        "messaging": int(act(a, MESSAGING)),
        "postEngagement": int(act(a, "post_engagement")),
        "video3s": video3s,
        "hookRate": round(video3s / impressions * 100, 1) if impressions else None,
        "thruplay": thruplay,
        "p25": int(act(r.get("video_p25_watched_actions"), "video_view")),
        "p50": int(act(r.get("video_p50_watched_actions"), "video_view")),
        "p75": int(act(r.get("video_p75_watched_actions"), "video_view")),
        "p100": int(act(r.get("video_p100_watched_actions"), "video_view")),
        "avgWatch": num(act(r.get("video_avg_time_watched_actions"), "video_view")),
    }
    out["completeRate"] = round(out["p100"] / impressions * 100, 1) if impressions else None
    key, en, ru = RESULT_BY_GOAL.get(goal or "", RESULT_BY_GOAL["REACH"])
    if key == "reach":
        results = reach
    elif key == "impressions":
        results = impressions
    elif key == "thruplay":
        results = thruplay
    elif key == "link_click":
        results = out["linkClicks"]
    else:
        results = int(act(a, key, "offsite_conversion.fb_pixel_lead") if key == "lead" else act(a, key))
    per_mille = key in ("reach", "impressions")
    out["results"] = results
    out["resultLabel"] = {"en": en, "ru": ru}
    out["costPerResult"] = (round(spend / results * (1000 if per_mille else 1), 2) if results else None)
    out["costPerResultPerMille"] = per_mille
    return out


def empty_metrics(goal=None):
    return metrics({}, goal)


def signals(total, ads, audience, launch_reach, account_status, adsets, rules, today):
    """Plain-language hints built from the plan's rules. Reach targets are cumulative, since launch.

    Each signal carries a stable `kind` code the UI can key off of, independent of the Russian text.
    `today` is an ISO date (YYYY-MM-DD) in the ad account's time zone.
    """
    out = []
    r = rules
    any_active = any(s.get("effective_status") == "ACTIVE" for s in adsets.values()) or any(a["status"] == "ACTIVE" for a in ads)
    billing_issue = (account_status != "ACTIVE"
                      or any(s.get("effective_status") == "PENDING_BILLING_INFO" for s in adsets.values())
                      or any(a["status"] == "PENDING_BILLING_INFO" for a in ads))
    if billing_issue:
        out.append({"kind": "billing", "tone": "bad", "text": "Проблема с оплатой — откройте Billing & payments."})
    if total["impressions"] == 0 and not any_active:
        out.append({"kind": "no_delivery", "tone": "warn", "text": "Показов пока нет. Если так дольше суток — сначала проверьте Billing & payments (оплата)."})
    if audience and audience.get("max") and launch_reach:
        mid = (audience["min"] + audience["max"]) / 2
        share = launch_reach / mid * 100
        target = next((t for t in r["reachTargets"] if today <= t["date"]), None)
        tone = "good" if target and share >= target["share"] else "info"
        text = f"С запуска охвачено ~{share:.0f}% аудитории."
        if target:
            text += f" Цель плана к {datetime.fromisoformat(target['date']).strftime('%d.%m')} — {target['share']}%."
        out.append({"kind": "reach_share", "tone": tone, "text": text})
    if total["frequency"] >= r["frequencyBad"]:
        out.append({"kind": "frequency_bad", "tone": "bad", "text": f"Частота {total['frequency']:.1f} — люди видят рекламу слишком часто (порог {r['frequencyBad']})."})
    elif total["impressions"]:
        out.append({"kind": "frequency_ok", "tone": "good", "text": f"Частота {total['frequency']:.2f} — норма (до {r['frequencyOk']:.0f})."})
    if total["impressions"] >= 1000 and total["cpm"] > r["cpmBad"]:
        out.append({"kind": "cpm_bad", "tone": "bad", "text": f"1000 показов стоят ${total['cpm']:.2f} — дороже порога ${r['cpmBad']}. Стоит снизить бюджет."})
    ready = [a for a in ads if a["lifetimeImpressions"] >= r["minImpressions"]]
    if not ready and ads:
        out.append({"kind": "too_early", "tone": "info", "text": f"Пока ни у одного ролика нет {r['minImpressions']} показов — выводы по роликам рано делать."})
    for a in ready:
        rate = a["lifetimeHookRate"]
        if rate is None:
            continue
        if rate < r["hookBad"]:
            out.append({"kind": "video_weak", "tone": "bad", "text": f"{a['name']}: досмотр 3 с {rate:.0f}% (с запуска) — слабее {r['hookBad']}%. Кандидат на выключение (решение за владельцем)."})
        elif rate >= r["hookGood"]:
            out.append({"kind": "video_strong", "tone": "good", "text": f"{a['name']}: досмотр 3 с {rate:.0f}% (с запуска) — сильный ролик."})
    if total["messaging"]:
        out.append({"kind": "messaging", "tone": "good", "text": f"Начатых переписок: {total['messaging']}. Отвечайте в течение часа по скрипту продаж."})
    return out
