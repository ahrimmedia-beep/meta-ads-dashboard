"""Tests for insights.py. The numbers are made up; the thresholds are examples, not the real campaign rules."""
import pytest

from insights import MESSAGING, empty_metrics, metrics, num, signals

RULES = {
    "minImpressions": 400,
    "hookGood": 30,
    "hookBad": 12,
    "frequencyOk": 2,
    "frequencyBad": 3,
    "cpmBad": 15,
    "reachTargets": [{"date": "2026-05-14", "share": 40}, {"date": "2026-05-18", "share": 65}],
}

ROW = {
    "spend": "14.60",
    "impressions": "2400",
    "reach": "2010",
    "frequency": "1.19403",
    "cpm": "6.083333",
    "inline_link_clicks": "7",
    "actions": [
        {"action_type": "video_view", "value": "600"},
        {"action_type": "post_engagement", "value": "640"},
        {"action_type": MESSAGING, "value": "2"},
        {"action_type": "lead", "value": "1"},
        {"action_type": "offsite_conversion.fb_pixel_lead", "value": "2"},
    ],
    "video_thruplay_watched_actions": [{"action_type": "video_view", "value": "150"}],
    "video_p25_watched_actions": [{"action_type": "video_view", "value": "400"}],
    "video_p100_watched_actions": [{"action_type": "video_view", "value": "120"}],
    "video_avg_time_watched_actions": [{"action_type": "video_view", "value": "3.4"}],
}


# ---------- metrics ----------

def test_num_reads_meta_strings_and_missing_values():
    assert num("12.7") == 12.7
    assert num("12.7", int) == 12
    assert num(None) == 0.0
    assert num("n/a", int) == 0


def test_metrics_flattens_an_insights_row():
    m = metrics(ROW, "REACH")
    assert m["spend"] == 14.6
    assert m["impressions"] == 2400
    assert m["reach"] == 2010
    assert m["frequency"] == 1.19
    assert m["cpm"] == 6.08
    assert m["linkClicks"] == 7
    assert m["messaging"] == 2
    assert m["postEngagement"] == 640
    assert m["video3s"] == 600
    assert m["thruplay"] == 150
    assert (m["p25"], m["p50"], m["p100"]) == (400, 0, 120)
    assert m["avgWatch"] == 3.4


def test_hook_and_completion_rates_are_shares_of_impressions():
    m = metrics(ROW)
    assert m["hookRate"] == 25.0
    assert m["completeRate"] == 5.0


def test_reach_goal_prices_results_per_thousand_people():
    m = metrics(ROW, "REACH")
    assert m["results"] == 2010
    assert m["costPerResult"] == 7.26
    assert m["costPerResultPerMille"] is True
    assert m["resultLabel"] == {"en": "Reach", "ru": "Охват"}


@pytest.mark.parametrize(
    ("goal", "results", "cost", "per_mille"),
    [
        ("IMPRESSIONS", 2400, 6.08, True),
        ("CONVERSATIONS", 2, 7.3, False),
        ("LINK_CLICKS", 7, 2.09, False),
        ("THRUPLAY", 150, 0.1, False),
        ("LEAD_GENERATION", 3, 4.87, False),
    ],
)
def test_result_depends_on_the_optimization_goal(goal, results, cost, per_mille):
    m = metrics(ROW, goal)
    assert m["results"] == results
    assert m["costPerResult"] == cost
    assert m["costPerResultPerMille"] is per_mille


def test_lead_goal_counts_pixel_leads_too():
    assert metrics(ROW, "OFFSITE_CONVERSIONS")["results"] == 3


def test_unknown_goal_falls_back_to_reach():
    assert metrics(ROW, "SOMETHING_NEW")["resultLabel"]["en"] == "Reach"


def test_empty_row_gives_zeros_and_no_rates():
    m = empty_metrics("CONVERSATIONS")
    assert m["impressions"] == 0
    assert m["spend"] == 0
    assert m["hookRate"] is None
    assert m["completeRate"] is None
    assert m["results"] == 0
    assert m["costPerResult"] is None
    assert m["resultLabel"]["en"] == "Messaging conversations started"


# ---------- signals ----------

def total(**over):
    return {**empty_metrics(), **over}


def ad(name, status="ACTIVE", life=0, rate=None):
    return {"name": name, "status": status, "lifetimeImpressions": life, "lifetimeHookRate": rate}


ACTIVE_SET = {"s1": {"effective_status": "ACTIVE"}}


def run(t=None, ads=(), audience=None, launch_reach=0, account="ACTIVE", adsets=None, rules=RULES, today="2026-05-13"):
    return signals(t or total(), list(ads), audience, launch_reach, account,
                   ACTIVE_SET if adsets is None else adsets, rules, today)


def kinds(out):
    return [s["kind"] for s in out]


def test_quiet_account_gives_no_signals():
    assert run() == []


@pytest.mark.parametrize(
    ("account", "adsets", "ads"),
    [
        ("DISABLED", ACTIVE_SET, []),
        ("ACTIVE", {"s1": {"effective_status": "PENDING_BILLING_INFO"}}, []),
        ("ACTIVE", ACTIVE_SET, [ad("A · r01", status="PENDING_BILLING_INFO")]),
    ],
)
def test_billing_problem_comes_first(account, adsets, ads):
    out = run(account=account, adsets=adsets, ads=ads)
    assert out[0]["kind"] == "billing"
    assert out[0]["tone"] == "bad"


def test_no_delivery_only_when_nothing_is_active():
    paused = {"s1": {"effective_status": "PAUSED"}}
    assert kinds(run(adsets=paused, ads=[ad("A · r01", status="PAUSED")])) == ["no_delivery", "too_early"]
    assert "no_delivery" not in kinds(run(adsets=paused, ads=[ad("A · r01")]))


def test_reach_share_against_the_next_target():
    # Middle of the audience estimate is 2000; 1100 people reached is 55%.
    out = run(audience={"min": 1000, "max": 3000}, launch_reach=1100, today="2026-05-13")
    assert out == [{"kind": "reach_share", "tone": "good",
                    "text": "С запуска охвачено ~55% аудитории. Цель плана к 14.05 — 40%."}]


def test_reach_target_due_today_still_counts():
    out = run(audience={"min": 1000, "max": 3000}, launch_reach=1100, today="2026-05-14")
    assert out[0]["text"].endswith("к 14.05 — 40%.")


def test_reach_share_below_the_next_target_is_info():
    out = run(audience={"min": 1000, "max": 3000}, launch_reach=1100, today="2026-05-15")
    assert out[0]["tone"] == "info"
    assert out[0]["text"].endswith("к 18.05 — 65%.")


def test_reach_share_after_the_last_target_has_no_target():
    out = run(audience={"min": 1000, "max": 3000}, launch_reach=1100, today="2026-05-19")
    assert out[0] == {"kind": "reach_share", "tone": "info", "text": "С запуска охвачено ~55% аудитории."}


def test_reach_share_needs_an_audience_estimate_and_reach():
    assert run(audience=None, launch_reach=1100) == []
    assert run(audience={"min": 1000, "max": 3000}, launch_reach=0) == []


def test_frequency_bad_from_the_threshold_inclusive():
    out = run(t=total(impressions=900, frequency=3.0))
    assert out[0]["kind"] == "frequency_bad"
    assert "(порог 3)" in out[0]["text"]


def test_frequency_ok_only_with_impressions():
    assert run(t=total(impressions=900, frequency=1.4))[0]["text"] == "Частота 1.40 — норма (до 2)."
    assert run(t=total(impressions=0, frequency=0)) == []


def test_rules_are_parameters():
    strict = {**RULES, "frequencyBad": 1.2}
    assert kinds(run(t=total(impressions=900, frequency=1.4), rules=strict)) == ["frequency_bad"]


@pytest.mark.parametrize(
    ("impressions", "cpm", "flagged"),
    [(999, 40, False), (1000, 15, False), (1000, 15.01, True)],
)
def test_cpm_needs_1000_impressions_and_a_price_above_the_threshold(impressions, cpm, flagged):
    out = run(t=total(impressions=impressions, frequency=1.0, cpm=cpm))
    assert ("cpm_bad" in kinds(out)) is flagged


def test_too_early_until_a_video_has_enough_impressions():
    assert kinds(run(ads=[ad("A · r01", life=399, rate=40)])) == ["too_early"]
    assert run(ads=[]) == []


def test_videos_are_judged_on_the_rate_since_launch():
    ads = [
        ad("A · r01", life=900, rate=8),
        ad("A · r02", life=900, rate=30),
        ad("A · r03", life=900, rate=20),
        ad("A · r04", life=900, rate=None),
        ad("A · r05", life=100, rate=50),
    ]
    out = run(ads=ads)
    assert kinds(out) == ["video_weak", "video_strong"]
    assert out[0]["text"].startswith("A · r01: досмотр 3 с 8% (с запуска) — слабее 12%.")
    assert out[1]["text"] == "A · r02: досмотр 3 с 30% (с запуска) — сильный ролик."


def test_messages_started():
    out = run(t=total(impressions=900, frequency=1.1, messaging=2))
    assert kinds(out) == ["frequency_ok", "messaging"]
    assert out[1]["text"].startswith("Начатых переписок: 2.")


def test_signal_order_is_stable():
    out = run(
        t=total(impressions=5000, frequency=3.5, cpm=22, messaging=1),
        ads=[ad("A · r01", life=900, rate=5)],
        audience={"min": 1000, "max": 3000},
        launch_reach=1500,
        account="DISABLED",
    )
    assert kinds(out) == ["billing", "reach_share", "frequency_bad", "cpm_bad", "video_weak", "messaging"]
