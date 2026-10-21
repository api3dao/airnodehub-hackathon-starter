// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Test} from "forge-std/Test.sol";
import {JSONParserLib} from "solady/utils/JSONParserLib.sol";
import {ProjectedJson} from "../contracts/ProjectedJson.sol";

// The library functions are internal, so the tests call them through a contract, where expectRevert can catch a revert.
contract ProjectedJsonHarness {
    function readUint(bytes calldata json, string calldata key, uint8 decimals) external pure returns (uint256) {
        return ProjectedJson.readUint(json, key, decimals);
    }

    function readInt(bytes calldata json, string calldata key, uint8 decimals) external pure returns (int256) {
        return ProjectedJson.readInt(json, key, decimals);
    }

    function readBool(bytes calldata json, string calldata key) external pure returns (bool) {
        return ProjectedJson.readBool(json, key);
    }

    function readString(bytes calldata json, string calldata key) external pure returns (string memory) {
        return ProjectedJson.readString(json, key);
    }
}

contract ProjectedJsonTest is Test {
    ProjectedJsonHarness harness = new ProjectedJsonHarness();

    function test_ReadUint_ReadsAnInteger() public view {
        assertEq(harness.readUint('{"updatedAt":1792403240691}', "updatedAt", 0), 1792403240691);
    }

    function test_ReadUint_ScalesADecimalToTheRequestedDecimals() public view {
        assertEq(harness.readUint('{"price":2443.95}', "price", 18), 2443.95e18);
        assertEq(harness.readUint('{"price":2443.95}', "price", 2), 244395);
    }

    function test_ReadUint_CutsOffDigitsAfterTheRequestedDecimals() public view {
        assertEq(harness.readUint('{"price":2443.959}', "price", 2), 244395);
        assertEq(harness.readUint('{"price":0.004}', "price", 2), 0);
    }

    function test_ReadUint_ReadsVerySmallAndVeryLargeNumbers() public view {
        assertEq(harness.readUint('{"price":0.00000012}', "price", 18), 1.2e11);
        assertEq(harness.readUint('{"supply":2500000000000000000000}', "supply", 0), 2.5e21);
    }

    function test_ReadUint_ReadsZero() public view {
        assertEq(harness.readUint('{"value":0}', "value", 18), 0);
    }

    function test_ReadInt_ReadsNegativeNumbers() public view {
        assertEq(harness.readInt('{"temperature":-12.5}', "temperature", 1), -125);
        assertEq(harness.readInt('{"temperature":-1.239}', "temperature", 2), -123);
        assertEq(harness.readInt('{"rate":-0.00000015}', "rate", 9), -150);
        assertEq(harness.readInt('{"temperature":21}', "temperature", 0), 21);
    }

    function test_ReadBool_ReadsTrueAndFalse() public view {
        assertTrue(harness.readBool('{"isFinal":true}', "isFinal"));
        assertFalse(harness.readBool('{"isFinal":false}', "isFinal"));
    }

    function test_ReadString_ReadsTheTextBetweenTheQuotes() public view {
        assertEq(harness.readString('{"category":"crypto"}', "category"), "crypto");
        assertEq(harness.readString('{"category":""}', "category"), "");
    }

    function test_ReadString_DecodesEscapeSequences() public view {
        assertEq(harness.readString('{"note":"say \\"hi\\""}', "note"), 'say "hi"');
        assertEq(harness.readString('{"city":"Z\\u00fcrich"}', "city"), unicode"Zürich");
    }

    function test_ReadsJsonWithWhitespace() public view {
        assertEq(harness.readUint('{ "price" : 2443.95,\n  "updatedAt" : 1792403240691 }', "price", 2), 244395);
    }

    function test_FindsAFieldInAnyPosition() public view {
        bytes memory json = '{"price":2443.95,"updatedAt":1792403240691,"category":"crypto"}';
        assertEq(harness.readUint(json, "price", 2), 244395);
        assertEq(harness.readUint(json, "updatedAt", 0), 1792403240691);
        assertEq(harness.readString(json, "category"), "crypto");
    }

    function test_MatchesOnlyTheWholeFieldName() public view {
        assertEq(harness.readUint('{"prices":1,"price":2}', "price", 0), 2);
    }

    function test_IgnoresFieldNamesInsideStrings() public view {
        assertEq(harness.readUint('{"note":"\\",\\"price\\":1","price":2}', "price", 0), 2);
    }

    function test_SkipsNestedObjectsAndArrays() public view {
        bytes memory json = '{"feed":{"price":1,"sources":["a}",[2]]},"price":2}';
        assertEq(harness.readUint(json, "price", 0), 2);
    }

    function test_RevertWhen_FieldIsMissing() public {
        vm.expectRevert(abi.encodeWithSelector(ProjectedJson.FieldNotFound.selector, "price"));
        harness.readUint('{"updatedAt":1792403240691}', "price", 0);
    }

    function test_RevertWhen_FieldIsNested() public {
        vm.expectRevert(abi.encodeWithSelector(ProjectedJson.FieldNotFound.selector, "price"));
        harness.readUint('{"feed":{"price":1}}', "price", 0);
    }

    function test_RevertWhen_ReadUintFindsANegativeNumber() public {
        vm.expectRevert(abi.encodeWithSelector(ProjectedJson.UnexpectedValue.selector, "temperature"));
        harness.readUint('{"temperature":-1}', "temperature", 0);
    }

    function test_RevertWhen_ANumberIsExpectedButTheValueIsNot() public {
        string[5] memory values = ['"2443.95"', "true", "null", '{"value":1}', "[1]"];
        for (uint256 index = 0; index < values.length; index++) {
            vm.expectRevert(abi.encodeWithSelector(ProjectedJson.UnexpectedValue.selector, "price"));
            harness.readUint(bytes.concat('{"price":', bytes(values[index]), "}"), "price", 0);
        }
    }

    function test_RevertWhen_ANumberUsesExponentNotation() public {
        // JSONParserLib accepts these as JSON numbers, but its parseUint reads only digits.
        string[3] memory values = ["1.2e-7", "1e+21", "2.5E+21"];
        for (uint256 index = 0; index < values.length; index++) {
            vm.expectRevert(JSONParserLib.ParsingFailed.selector);
            harness.readUint(bytes.concat('{"price":', bytes(values[index]), "}"), "price", 0);
        }
    }

    function test_RevertWhen_TheJsonIsInvalid() public {
        string[6] memory jsons = ['{"price":-}', '{"price":1.}', '{"price":.5}', '{"price":}', '{"note":"abc}', ""];
        for (uint256 index = 0; index < jsons.length; index++) {
            vm.expectRevert(JSONParserLib.ParsingFailed.selector);
            harness.readUint(bytes(jsons[index]), "price", 0);
        }
    }

    function test_RevertWhen_ReadIntOverflows() public {
        vm.expectRevert(abi.encodeWithSelector(SafeCast.SafeCastOverflowedUintToInt.selector, 2 ** 255));
        harness.readInt(bytes.concat('{"value":', bytes(vm.toString(uint256(2 ** 255))), "}"), "value", 0);
    }

    function test_RevertWhen_ABoolIsExpectedButTheValueIsNot() public {
        vm.expectRevert(abi.encodeWithSelector(ProjectedJson.UnexpectedValue.selector, "isFinal"));
        harness.readBool('{"isFinal":1}', "isFinal");
    }

    function test_RevertWhen_AStringIsExpectedButTheValueIsNot() public {
        vm.expectRevert(abi.encodeWithSelector(ProjectedJson.UnexpectedValue.selector, "category"));
        harness.readString('{"category":1}', "category");
    }

    function test_RevertWhen_TheDataIsNotAnObject() public {
        vm.expectRevert(abi.encodeWithSelector(ProjectedJson.FieldNotFound.selector, "price"));
        harness.readUint("[1]", "price", 0);
        vm.expectRevert(abi.encodeWithSelector(ProjectedJson.FieldNotFound.selector, "price"));
        harness.readUint("2443.95", "price", 0);
    }

    function test_EscapePointerToken_EscapesSlashes() public pure {
        assertEq(ProjectedJson.escapePointerToken("ETH/USD"), "ETH~1USD");
    }

    function test_EscapePointerToken_EscapesTildesBeforeSlashes() public pure {
        assertEq(ProjectedJson.escapePointerToken("a~/b"), "a~0~1b");
        assertEq(ProjectedJson.escapePointerToken("~1"), "~01");
    }

    function test_EscapePointerToken_LeavesOtherKeysAsTheyAre() public pure {
        assertEq(ProjectedJson.escapePointerToken("BTC-USD"), "BTC-USD");
        assertEq(ProjectedJson.escapePointerToken(""), "");
    }

    function testFuzz_ReadUint_ReadsAnyInteger(uint256 value) public view {
        assertEq(harness.readUint(bytes.concat('{"value":', bytes(vm.toString(value)), "}"), "value", 0), value);
    }

    function testFuzz_ReadInt_ReadsAnyInteger(int256 value) public view {
        vm.assume(value != type(int256).min);
        assertEq(harness.readInt(bytes.concat('{"value":', bytes(vm.toString(value)), "}"), "value", 0), value);
    }

    function testFuzz_ReadUint_ScalesIntegersToDecimals(uint128 value, uint8 decimals) public view {
        decimals = uint8(bound(decimals, 0, 36));
        bytes memory json = bytes.concat('{"value":', bytes(vm.toString(value)), "}");
        assertEq(harness.readUint(json, "value", decimals), uint256(value) * 10 ** decimals);
    }
}
