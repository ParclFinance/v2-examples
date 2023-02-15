<div align="center">
<img height="180" src="https://avatars.githubusercontent.com/u/84755822?s=200&v=4"/>
<h1 style="margin-top:-15px;">Funding Gap Filler</h1>
</div>

# Quick Start

This bot tracks changes to a pool so it can put on minority-side trades that collect accrued funding from the majority. The bot helps push markets toward 50/50 skew. This bot takes on price risk.

### Configuration

#### Set Environment Variables

- Set a Solana cluster.
- Set a wallet for the bot.
  - Use a wallet exclusively for this bot that does not have any open positions.
  - Use base58 encoded private key as an environment variable.
  - If PRIVATE_KEY is not found in the environment variables, then the bot defaults to the machine's Solana CLI default keypair.
- Set the pool address.
  - Check the [docs](https://docs.parcl.co/smart-contracts-+-accounts#pools) for pool addresses.
- Set an RPC url to connect to Solana.
  - If you need a url, check out this list of public and private providers [here](https://solana.com/rpc).

### Start Bot

```sh
yarn start
```

# Make it better

- This bot is far from production ready. What would make it better?
- Price risk protection?
- Are the hooks dynamic enough?

# DISCLAIMER

- **This software is for educational purposes only**
- **This software is not financial advice**
- **See warning below**
- **Use at your own risk**

## ⚠ Warning

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
