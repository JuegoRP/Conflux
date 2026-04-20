/**
 * LetterSystem.js — CONFLUX v2.0
 * Sestaví Eliův dopis na základě toho jak hráč hrál.
 * Volá se z w5_profile_display nodu.
 */

import GameState from '../engine/GameState.js';

class LetterSystem {
    constructor(campaignData) {
        this.template = campaignData.letterSystem;
        this.gs = GameState;
    }

    /**
     * Sestaví dopis. Vrátí pole odstavců.
     */
    compose() {
        const gs = this.gs;
        const s = this.template.segments;
        const paragraphs = [];

        // --- Intro ---
        paragraphs.push(this.template.intro);

        // --- Jak přišel: rychlost průchodu světem 1 ---
        const w1Speed = gs.getFlag('w1_completion_speed') || 'neutral';
        // fast = méně než 3 prohry v světě 1, slow = více než 5 proher
        const w1Losses = gs.getCounter('w1_losses') || 0;
        if (w1Losses <= 2) {
            paragraphs.push(s.arrival.fast);
        } else if (w1Losses >= 5) {
            paragraphs.push(s.arrival.slow);
        } else {
            paragraphs.push(s.arrival.neutral);
        }

        // --- Kořen: co rozhodl ---
        if (gs.hasFlag('chose_defend_koren')) {
            paragraphs.push(s.koren_stayed);
        } else if (gs.hasFlag('chose_leave_koren')) {
            paragraphs.push(s.koren_left);
        } else if (gs.hasFlag('chose_negotiate')) {
            paragraphs.push(s.koren_negotiated);
        }

        // --- Synth: nabídka Sítě ---
        if (gs.hasFlag('accepted_network_deal')) {
            paragraphs.push(s.synth_accepted);
        } else if (gs.hasFlag('refused_network_deal')) {
            paragraphs.push(s.synth_refused);
        }

        // --- Corruption ---
        const corruption = gs.corruption || 0;
        if (gs.hasFlag('on_dark_branch') || gs.hasFlag('chose_dark_ending')) {
            paragraphs.push(s.corruption_dark);
        } else if (corruption >= 4) {
            paragraphs.push(s.corruption_high);
        } else {
            paragraphs.push(s.corruption_low);
        }

        // --- Playstyle ---
        const style = this._computePlaystyle();
        if (style === 'aggressive') {
            paragraphs.push(s.playstyle_aggressive);
        } else if (style === 'defensive') {
            paragraphs.push(s.playstyle_defensive);
        } else {
            paragraphs.push(s.playstyle_balanced);
        }

        // --- Tomáš ---
        if (gs.hasFlag('accepted_knife_trust') || gs.hasFlag('traded_knife_for_card')) {
            paragraphs.push(s.tomash_knife);
        } else if (gs.hasFlag('refused_knife')) {
            paragraphs.push(s.tomash_refused);
        }

        // --- Mira ---
        if (gs.hasFlag('told_mira_suspicion') || gs.hasFlag('offered_help_mira')) {
            paragraphs.push(s.mira_trusted);
        } else if (gs.hasFlag('watched_silently') || gs.hasFlag('respected_mira_silence')) {
            paragraphs.push(s.mira_watched);
        }

        // --- Vale-7 / Václav ---
        if (gs.hasFlag('allied_with_vale7')) {
            paragraphs.push(s.vale7_allied);
        } else if (gs.hasFlag('kept_distance_vale7')) {
            paragraphs.push(s.vale7_distant);
        }

        // --- Závěr s jménem ---
        const name = this._resolveName();
        const closing = s.closing.replace('[jméno]', name);
        paragraphs.push(closing);

        return paragraphs;
    }

    /**
     * Určí herní styl z dat GameState.
     */
    _computePlaystyle() {
        const playstyle = this.gs.playstyle || {};
        const attacks = playstyle.attacks || 0;
        const defenses = playstyle.defenses || 0;
        const total = attacks + defenses;

        if (total === 0) return 'balanced';

        const aggressRatio = attacks / total;
        if (aggressRatio > 0.65) return 'aggressive';
        if (aggressRatio < 0.35) return 'defensive';
        return 'balanced';
    }

    /**
     * Určí jméno hráče z flagů.
     * Hierarchie: přijaté jméno z masky Miry > jméno od komunity Kořene > "Courier".
     */
    _resolveName() {
        const gs = this.gs;

        // Jméno ze světa 5 — slyšel skutečné jméno?
        if (gs.hasFlag('heard_true_name') || gs.hasFlag('true_name_almost_heard')) {
            // Jméno je záměrně prázdné — hráč ho ví, ale hra ho nevysloví
            return '—';
        }

        // Jméno přijaté v Kořeni
        if (gs.hasFlag('accepted_echo_name')) {
            return 'to co ti říkali';
        }

        // Fallback
        return 'Courier';
    }

    /**
     * Vrátí hotový dopis jako jeden string s mezerami mezi odstavci.
     */
    render() {
        return this.compose().join('\n\n');
    }

    /**
     * Vrátí dopis jako HTML pro zobrazení v UI.
     */
    renderHTML() {
        const paragraphs = this.compose();
        const html = paragraphs
            .map(p => `<p class="letter-paragraph">${p.replace(/\n/g, '<br>')}</p>`)
            .join('\n');

        return `
            <div class="letter-container">
                <div class="letter-header">
                    <span class="letter-from">od: Eli</span>
                    <span class="letter-to">pro: tebe</span>
                </div>
                <div class="letter-body">
                    ${html}
                </div>
            </div>
        `;
    }
}

export default LetterSystem;
