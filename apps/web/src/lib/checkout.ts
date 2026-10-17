type CheckoutResult = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}
type CheckoutOptions = {
  key: string
  order_id: string
  amount: number
  currency: string
  name: string
  description: string
  handler: (r: CheckoutResult) => void
  modal: { ondismiss: () => void }
  theme: { color: string }
}
declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => {
      open: () => void
      on: (name: string, fn: () => void) => void
    }
  }
}
let checkoutScript: Promise<void> | undefined
export function loadCheckout() {
  if (window.Razorpay) return Promise.resolve()
  if (!checkoutScript)
    checkoutScript = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      const fail = () => {
        script.remove()
        checkoutScript = undefined
        reject(new Error('checkout_unavailable'))
      }
      const timer = window.setTimeout(fail, 12000)
      script.onload = () => {
        clearTimeout(timer)
        if (window.Razorpay) resolve()
        else fail()
      }
      script.onerror = () => {
        clearTimeout(timer)
        fail()
      }
      document.head.append(script)
    })
  return checkoutScript
}
