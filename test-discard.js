// Test script to verify discard functionality
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const baseUrl = 'http://localhost:3000';

async function testDiscardFunctionality() {
    console.log('🧪 Testing discard functionality...\n');
    
    try {
        // 1. Create a new game
        console.log('1. Creating new game...');
        const createResponse = await fetch(`${baseUrl}/api/game/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const createResult = await createResponse.json();
        
        if (createResult.status !== 'OK') {
            throw new Error('Failed to create game');
        }
        
        const gameId = createResult.data.gameId;
        const initialState = createResult.data.gameState;
        
        console.log(`✅ Game created: ${gameId}`);
        console.log(`   Phase: ${initialState.phase}`);
        console.log(`   Current player: ${initialState.currentPlayer}`);
        console.log(`   Player 0 hand size: ${initialState.players[0].hand.tiles.length}`);
        
        // 2. Get first tile from player 0's hand
        const firstTile = initialState.players[0].hand.tiles[0];
        console.log(`\n2. Attempting to discard tile: ${firstTile.displayName} (${firstTile.unicode})`);
        
        // 3. Perform discard action
        const discardResponse = await fetch(`${baseUrl}/api/game/${gameId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'discard',
                playerId: 'player_0',
                tileId: firstTile.id,
                timestamp: Date.now()
            })
        });
        
        const discardResult = await discardResponse.json();
        console.log(`✅ Discard response: ${discardResult.status}`);
        
        if (discardResult.status === 'OK') {
            const newState = discardResult.data.gameState;
            console.log(`   New hand size: ${newState.players[0].hand.tiles.length}`);
            console.log(`   Current player after discard: ${newState.currentPlayer}`);
            console.log(`   Discard pile size: ${newState.gameLog.length}`);
            
            // Verify the tile was actually removed
            if (newState.players[0].hand.tiles.length === initialState.players[0].hand.tiles.length - 1) {
                console.log('✅ Tile successfully removed from hand!');
            } else {
                console.log('❌ Tile was NOT removed from hand!');
            }
            
            // Check if turn advanced
            if (newState.currentPlayer !== initialState.currentPlayer) {
                console.log('✅ Turn advanced to next player!');
            } else {
                console.log('❌ Turn did NOT advance!');
            }
        } else {
            console.log('❌ Discard failed:', discardResult.message);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Check if this is being run directly from command line
if (require.main === module) {
    testDiscardFunctionality();
} else {
    module.exports = { testDiscardFunctionality };
}