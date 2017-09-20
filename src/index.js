import Koa from 'koa'
import Router from 'koa-router'
import BodyParser from 'koa-bodyparser'
import Cors from 'kcors'
import Respond from 'koa-respond'
import Logger from 'koa-logger'
import Stripe from 'stripe'
import Ajv from 'ajv'
import log from 'bristol'
import palin from 'palin'
import dotenv from 'dotenv'

const config = dotenv.load().parsed
log.addTarget('console').withFormatter(palin)

const app = new Koa()
const logger = new Logger()
const router = new Router()
const bodyParser = new BodyParser()
const cors = new Cors()
const respond = new Respond()
const ajv = new Ajv()
const stripe = Stripe(config.STRIPE_SECRET_KEY)

const chargeSchema = {
  properties: {
    stripe_token: { type: 'string' },
    email: { type: 'string', format: 'email' },
    amount: { type: 'integer', exclusiveMinimum: 0 }
  },
  required: ['stripe_token', 'email', 'amount']
}

router.post('/api/payments/charge', async function (ctx) {
  const validate = ajv.compile(chargeSchema)
  if (!validate(ctx.request.body)) {
    ctx.badRequest({ error: validate.errors })
    return
  }

  const stripeToken = ctx.request.body.stripe_token
  const email = ctx.request.body.email
  const amount = ctx.request.body.amount

  const account = await stripe.accounts.create({
    type: 'custom',
    country: 'US',
    email,
    external_account: stripeToken
  })

  const charge = await stripe.charges.create({
    amount,
    currency: 'usd',
    source: stripeToken
  })

  ctx.ok({ account_id: account.id, charge_id: charge.id })
})

const payoutSchema = {
  properties: {
    account_id: { type: 'string' },
    amount: { type: 'integer', exclusiveMinimum: 0 }
  },
  required: ['account_id', 'amount']
}

router.post('/api/payments/payout', async function (ctx) {
  const validate = ajv.compile(payoutSchema)
  if (!validate(ctx.request.body)) {
    ctx.badRequest({ error: validate.errors })
    return
  }

  // For testing environment, you need to make your balance positive first
  // await stripe.charges.create({
  //   amount: 1000000,
  //   source: 'tok_bypassPending',
  //   currency: 'usd'
  // })

  const accountId = ctx.request.body.account_id
  const amount = ctx.request.body.amount

  const transfer = await stripe.transfers.create({
    amount,
    currency: 'usd',
    destination: accountId
  })

  ctx.ok({ transfer_id: transfer.id })
})

router.get('/health-check', async function (ctx) {
  ctx.ok('OK')
})

app
  .use(logger)
  .use(cors)
  .use(bodyParser)
  .use(respond)
  .use(router.routes())
  .use(router.allowedMethods())

app.on('error', (err, ctx) => {
  log.error('server error', err)
})

app.listen(config.PORT)
console.log(`Listening on ${config.PORT}`)
