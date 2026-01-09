/**
 * MarineStream Workspace - Auth Routes
 * Clerk webhook handling for user sync
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * POST /api/auth/webhook
 * Clerk webhook for user events (create, update, delete)
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify webhook signature (in production)
    const payload = JSON.parse(req.body.toString());
    const eventType = payload.type;
    const userData = payload.data;

    console.log(`📨 Clerk webhook: ${eventType}`);

    switch (eventType) {
      case 'user.created':
        await db.query(
          `INSERT INTO users (clerk_id, email, full_name, avatar_url)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (clerk_id) DO NOTHING`,
          [
            userData.id,
            userData.email_addresses?.[0]?.email_address,
            `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
            userData.image_url
          ]
        );
        console.log(`✅ Created user: ${userData.email_addresses?.[0]?.email_address}`);
        break;

      case 'user.updated':
        await db.query(
          `UPDATE users SET 
            email = $2,
            full_name = $3,
            avatar_url = $4,
            updated_at = NOW()
           WHERE clerk_id = $1`,
          [
            userData.id,
            userData.email_addresses?.[0]?.email_address,
            `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
            userData.image_url
          ]
        );
        console.log(`✅ Updated user: ${userData.email_addresses?.[0]?.email_address}`);
        break;

      case 'user.deleted':
        await db.query(
          'DELETE FROM users WHERE clerk_id = $1',
          [userData.id]
        );
        console.log(`✅ Deleted user: ${userData.id}`);
        break;

      default:
        console.log(`ℹ️  Unhandled webhook event: ${eventType}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

/**
 * GET /api/auth/session
 * Check current session status (for frontend)
 */
router.get('/session', async (req, res) => {
  // This endpoint is called by the frontend to check auth state
  // Clerk handles the actual session verification client-side
  res.json({
    success: true,
    data: {
      authenticated: false, // Client will verify with Clerk
      message: 'Use Clerk client-side verification'
    }
  });
});

module.exports = router;
