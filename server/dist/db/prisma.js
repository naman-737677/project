"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.serializeBigInt = serializeBigInt;
const client_1 = require("@prisma/client");
exports.prisma = global.prisma || new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
if (process.env.NODE_ENV !== 'production') {
    global.prisma = exports.prisma;
}
/**
 * Utility to convert BigInt fields to String safely for JSON transport.
 */
function serializeBigInt(obj) {
    return JSON.parse(JSON.stringify(obj, (_, value) => typeof value === 'bigint' ? value.toString() : value));
}
