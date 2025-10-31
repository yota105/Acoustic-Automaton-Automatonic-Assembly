/**
 * 奏者別指示システムのテスト
 * 
 * コンソールで実行:
 * test("performer-targeting")
 */

import {
    composition,
    getEventsForPerformer,
    getEventsForOperator,
    isEventForPerformer,
    getEventsForPerformerAt
} from './works/composition';

export function testPerformerTargeting() {
    console.log("🎭 奏者別指示システムのテスト\n");

    // 1. 奏者情報の表示
    console.log("📋 登録されている奏者:");
    if (composition.performers) {
        composition.performers.forEach(performer => {
            console.log(`  ${performer.displayOrder}. ${performer.name} (${performer.id})`);
            console.log(`     役割: ${performer.role}`);
            console.log(`     楽器: ${performer.instrument}`);
            console.log(`     色: ${performer.color}\n`);
        });
    }

    // 2. 各奏者のイベント数を取得
    console.log("\n📊 各奏者へのイベント数:");
    if (composition.performers) {
        composition.performers.forEach(performer => {
            const events = getEventsForPerformer(composition, performer.id);
            console.log(`  ${performer.name}: ${events.length}件`);
        });
    }

    // 3. オペレーターのイベント数
    const operatorEvents = getEventsForOperator(composition);
    console.log(`  オペレーター: ${operatorEvents.length}件`);

    // 4. 演奏者Aの詳細イベント
    console.log("\n\n🎵 演奏者A (player1) のイベント詳細:");
    const player1Events = getEventsForPerformer(composition, "player1");
    player1Events.forEach((event, index) => {
        if (event.at.type === 'musical') {
            const time = event.at.time;
            console.log(`\n  ${index + 1}. [第${time.bar}小節 ${time.beat}拍目] ${event.label}`);
            console.log(`     タイプ: ${event.type}`);
            console.log(`     アクション: ${event.action}`);
            if (event.parameters?.instruction) {
                console.log(`     指示: ${event.parameters.instruction}`);
            }
            if (event.description) {
                console.log(`     説明: ${event.description}`);
            }
        }
    });

    // 5. 演奏者Bの詳細イベント
    console.log("\n\n🥁 演奏者B (player2) のイベント詳細:");
    const player2Events = getEventsForPerformer(composition, "player2");
    player2Events.forEach((event, index) => {
        if (event.at.type === 'musical') {
            const time = event.at.time;
            console.log(`\n  ${index + 1}. [第${time.bar}小節 ${time.beat}拍目] ${event.label}`);
            console.log(`     タイプ: ${event.type}`);
            console.log(`     アクション: ${event.action}`);
            if (event.parameters?.instruction) {
                console.log(`     指示: ${event.parameters.instruction}`);
            }
        }
    });

    // 6. 演奏者Cの詳細イベント
    console.log("\n\n🎹 演奏者C (player3) のイベント詳細:");
    const player3Events = getEventsForPerformer(composition, "player3");
    player3Events.forEach((event, index) => {
        if (event.at.type === 'musical') {
            const time = event.at.time;
            console.log(`\n  ${index + 1}. [第${time.bar}小節 ${time.beat}拍目] ${event.label}`);
            console.log(`     タイプ: ${event.type}`);
            console.log(`     アクション: ${event.action}`);
            if (event.parameters?.instruction) {
                console.log(`     指示: ${event.parameters.instruction}`);
            }
        }
    });

    // 7. 特定時刻のイベント（第17小節1拍目）
    console.log("\n\n⏰ 第17小節1拍目に発生するイベント:");
    if (composition.performers) {
        composition.performers.forEach(performer => {
            const events = getEventsForPerformerAt(composition, performer.id, 17, 1);
            if (events.length > 0) {
                console.log(`\n  ${performer.name}:`);
                events.forEach(event => {
                    console.log(`    - ${event.label}`);
                    if (event.parameters?.instruction) {
                        console.log(`      指示: ${event.parameters.instruction}`);
                    }
                });
            }
        });
    }

    // 8. イベントターゲットの判定テスト
    console.log("\n\n🎯 ターゲット判定テスト:");
    const testEvent = player1Events[0];
    if (testEvent) {
        console.log(`  イベント: ${testEvent.label}`);
        console.log(`  player1向け: ${isEventForPerformer(testEvent, "player1")}`);
        console.log(`  player2向け: ${isEventForPerformer(testEvent, "player2")}`);
        console.log(`  player3向け: ${isEventForPerformer(testEvent, "player3")}`);
    }

    // 9. セクション別のイベント数
    console.log("\n\n📑 セクション別のイベント数:");
    composition.sections.forEach(section => {
        console.log(`\n  ${section.name}:`);
        console.log(`    総イベント数: ${section.events.length}件`);

        // 奏者別に集計
        const eventsByPerformer: Record<string, number> = {};
        section.events.forEach(event => {
            if (composition.performers) {
                composition.performers.forEach(performer => {
                    if (isEventForPerformer(event, performer.id)) {
                        eventsByPerformer[performer.name] =
                            (eventsByPerformer[performer.name] || 0) + 1;
                    }
                });
            }
        });

        Object.entries(eventsByPerformer).forEach(([name, count]) => {
            console.log(`    ${name}: ${count}件`);
        });
    });

    console.log("\n\n✅ テスト完了！");
}

// グローバルにテスト関数を登録
if (typeof window !== 'undefined') {
    (window as any).testPerformerTargeting = testPerformerTargeting;
}
