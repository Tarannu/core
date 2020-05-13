import { Container, Utils as KernelUtils } from "@arkecosystem/core-kernel";

import { InternalController } from "@arkecosystem/core-p2p/src/socket-server/controllers/internal";
import { Networks, Utils, Blocks } from "@arkecosystem/crypto";
import { TransactionFactory } from "@arkecosystem/crypto/dist/transactions";
import { NetworkState } from "@arkecosystem/core-p2p/src/network-state";
import { NetworkStateStatus } from "@arkecosystem/core-p2p/src/enums";

describe("InternalController", () => {
    let internalController: InternalController;

    const container = new Container.Container();

    const logger = { warning: jest.fn(), debug: jest.fn() };
    const peerProcessor = { validateAndAcceptPeer: jest.fn() };
    const networkMonitor = { getNetworkState: jest.fn() };
    const emitter = { dispatch: jest.fn() };
    const database = { getActiveDelegates: jest.fn() };
    const poolCollator = { getBlockCandidateTransactions: jest.fn() };
    const poolService = { getPoolSize: jest.fn() };
    const blockchain = { getLastBlock: jest.fn(), forceWakeup: jest.fn() };
    const appGet = {
        [Container.Identifiers.TransactionPoolCollator]: poolCollator,
        [Container.Identifiers.TransactionPoolService]: poolService,
        [Container.Identifiers.BlockchainService]: blockchain,
    }
    const app = {
        get: (key) => appGet[key],
    };

    beforeAll(() => {
        container.unbindAll();
        container.bind(Container.Identifiers.LogService).toConstantValue(logger);
        container.bind(Container.Identifiers.PeerProcessor).toConstantValue(peerProcessor);
        container.bind(Container.Identifiers.PeerNetworkMonitor).toConstantValue(networkMonitor);
        container.bind(Container.Identifiers.EventDispatcherService).toConstantValue(emitter);
        container.bind(Container.Identifiers.DatabaseService).toConstantValue(database);
        container.bind(Container.Identifiers.Application).toConstantValue(app);
    });

    beforeEach(() => {
        internalController = container.resolve<InternalController>(InternalController);
    });

    describe("acceptNewPeer", () => {
        it("should call peerProcessor.validateAndAcceptPeer with the ip from payload", async () => {
            const ip = "187.155.66.33";
            await internalController.acceptNewPeer({ payload: { ip }}, {});

            expect(peerProcessor.validateAndAcceptPeer).toBeCalledTimes(1);
            expect(peerProcessor.validateAndAcceptPeer).toBeCalledWith({ ip });
        })
    });

    describe("emitEvent", () => {
        it("should call eventDispatcher.dispatch with {event, body} from payload", () => {
            const event = "test event";
            const body = { stuff: "thing" };
            internalController.emitEvent({ payload: { event, body }}, {});

            expect(emitter.dispatch).toBeCalledTimes(1);
            expect(emitter.dispatch).toBeCalledWith(event, body);
        })
    });

    describe("getUnconfirmedTransactions", () => {
        it("should return the unconfirmed transactions from the pool", async () => {
            const poolSize = 330;
            const unconfirmedTxs = Networks.testnet.genesisBlock.transactions.map(
                tx => TransactionFactory.fromData({
                    ...tx,
                    amount: Utils.BigNumber.make(tx.amount),
                    fee: Utils.BigNumber.make(1000000),
                })
            );
            poolService.getPoolSize = jest.fn().mockReturnValueOnce(poolSize);
            poolCollator.getBlockCandidateTransactions = jest.fn().mockReturnValueOnce(unconfirmedTxs);

            expect(await internalController.getUnconfirmedTransactions({}, {})).toEqual({
                poolSize,
                transactions: unconfirmedTxs.map(tx => tx.serialized.toString("hex")),
            });
        })
    });

    describe("getCurrentRound", () => {
        const block = {
            data: {
                id: "17882607875259085966",
                version: 0,
                timestamp: 46583330,
                height: 2,
                reward: Utils.BigNumber.make("0"),
                previousBlock: "17184958558311101492",
                numberOfTransactions: 0,
                totalAmount: Utils.BigNumber.make("0"),
                totalFee: Utils.BigNumber.make("0"),
                payloadLength: 0,
                payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                generatorPublicKey: "026c598170201caf0357f202ff14f365a3b09322071e347873869f58d776bfc565",
                blockSignature:
                    "3045022100e7385c6ea42bd950f7f6ab8c8619cf2f66a41d8f8f185b0bc99af032cb25f30d02200b6210176a6cedfdcbe483167fd91c21d740e0e4011d24d679c601fdd46b0de9",
            },
            transactions: [],
        } as Blocks.Block;
        
        it("should return the info of the current round", async () => {
            blockchain.getLastBlock = jest.fn().mockReturnValueOnce(block);
            const delegates = [
                {
                    publicKey: "026c598170201caf0357f202ff14f365a3b09322071e347873869f58d776bfc565",
                    getAttribute: () => "delegate1",
                    delegate: "delegate1",
                },
                {
                    publicKey: "026c740930201caf0357f202ff14f365a3b09322071e347873869f58d776bfc565",
                    getAttribute: () => "delegate2",
                    delegate: "delegate2",
                },
            ];
            database.getActiveDelegates = jest.fn().mockReturnValueOnce(delegates);
            const forgingInfo = {
                blockTimestamp: 97456,
                currentForger: 0,
                nextForger: 1,
                canForge: true,
            }
            jest.spyOn(KernelUtils.forgingInfoCalculator, "calculateForgingInfo").mockReturnValueOnce(forgingInfo);
            const roundInfo = { round: 1, nextRound: 2, maxDelegates: 71, roundHeight: 1 };
            jest.spyOn(KernelUtils.roundCalculator, "calculateRound").mockReturnValueOnce(roundInfo);

            const currentRound = await internalController.getCurrentRound({}, {});

            expect(currentRound).toEqual({
                current: roundInfo.round,
                reward: 0,
                timestamp: forgingInfo.blockTimestamp,
                delegates,
                currentForger: delegates[forgingInfo.currentForger],
                nextForger: delegates[forgingInfo.nextForger],
                lastBlock: block.data,
                canForge: forgingInfo.canForge,
            })
        })
    });

    describe("getNetworkState", () => {
        it("should return peerNetworkMonitor.getNetworkState()", async () => {
            const networkStateMock = new NetworkState(NetworkStateStatus.Default);
            networkMonitor.getNetworkState = jest.fn().mockReturnValueOnce(networkStateMock);

            const networkState = await internalController.getNetworkState({}, {});

            expect(networkState).toEqual(networkStateMock);
            expect(networkMonitor.getNetworkState).toBeCalledTimes(1);
        })
    });

    describe("syncBlockchain", () => {
        it("should call blockchain.forceWakeup()", () => {
            internalController.syncBlockchain({}, {});

            expect(blockchain.forceWakeup).toBeCalledTimes(1);
        })
    });
});
