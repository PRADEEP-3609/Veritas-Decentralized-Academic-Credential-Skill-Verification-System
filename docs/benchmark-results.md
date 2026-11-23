# Benchmark results

Generated 2026-11-18T23:51:51.472Z on a local Hardhat node (chainId 31337), Node v26.7.0.
Times are per operation averaged over up to 25 sampled credentials per cohort.

| Credentials | Batch prep (ms) | Avg proof depth | Proof gen (ms) | Off-chain verify (ms) | On-chain verify (ms) | Anchor gas |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 6.64 | 0 | 0.14 | 0.09 | 4.99 | 143,521 |
| 10 | 17.24 | 3.6 | 0.01 | 0.48 | 3.51 | 126,433 |
| 50 | 62.4 | 5.88 | 0.01 | 0.53 | 2.97 | 126,433 |
| 100 | 116.52 | 6.88 | 0.01 | 0.57 | 2.83 | 126,433 |
| 500 | 548.59 | 9 | 0.01 | 0.78 | 2.73 | 126,445 |
| 1000 | 1069.36 | 10 | 0.01 | 0.79 | 3.02 | 126,445 |

The anchor gas column is the single `issueBatch` transaction for the whole cohort, so on-chain storage cost is O(1) in the number of graduates.
